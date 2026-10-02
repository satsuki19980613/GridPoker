-- Grid Poker: profiles (nickname and rating), lobby (players waiting for VS Player), games (server-side state).
-- The browser never touches the tables. It calls only the RPC functions granted to `authenticated` at the end.
-- Moves go through the Neon Function "game", which connects as the database owner.

-- the caller's user id: the `sub` of the Neon Auth JWT that the Data API puts in request.jwt.claims
create or replace function public.current_uid()
returns uuid language sql stable set search_path = '' as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

create or replace function public.fail(p_code text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = p_code;
end $$;

create table public.profiles (
  uid        uuid primary key references neon_auth."user"(id) on delete cascade,
  nickname   text not null check (char_length(nickname) between 1 and 16),
  rating     int  not null default 1500,
  games      int  not null default 0,
  wins       int  not null default 0,
  losses     int  not null default 0,
  draws      int  not null default 0,
  created_at timestamptz not null default now()
);
create unique index profiles_nickname_key on public.profiles (lower(nickname));
create index profiles_rating_idx on public.profiles (rating desc) where games > 0;

create table public.lobby (
  uid     uuid primary key references public.profiles(uid) on delete cascade,
  since   timestamptz not null default now(),
  seen_at timestamptz not null default now()
);

create table public.games (
  id          uuid primary key,
  p0          uuid not null references public.profiles(uid) on delete cascade,
  p1          uuid not null references public.profiles(uid) on delete cascade,
  status      text not null default 'active' check (status in ('active', 'over')),
  state       jsonb not null,            -- full state including the deck and both hands: never returned to a browser
  ver         int  not null,
  view0       jsonb not null,            -- what seat 0 may see
  view1       jsonb not null,            -- what seat 1 may see
  deadline_ms bigint,                    -- epoch ms by which the player to act must act
  strikes     int[] not null default '{0,0}',
  winner      smallint,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (p0 <> p1)
);
create index games_p0_active on public.games (p0) where status = 'active';
create index games_p1_active on public.games (p1) where status = 'active';

alter table public.profiles enable row level security;
alter table public.lobby    enable row level security;
alter table public.games    enable row level security;
revoke all on table public.profiles, public.lobby, public.games from public, anonymous, authenticated;

-- the signed-in player's profile (created on first call with a random nickname) and their active game, if any
create or replace function public.me()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := public.current_uid();
  v_p    public.profiles;
  v_game uuid;
  n      int := 0;
begin
  if v_uid is null or not exists (select 1 from neon_auth."user" u where u.id = v_uid) then
    perform public.fail('not_authenticated');
  end if;
  select * into v_p from public.profiles where uid = v_uid;
  while not found loop
    n := n + 1;
    if n > 20 then perform public.fail('nickname_exhausted'); end if;
    insert into public.profiles (uid, nickname)
      values (v_uid, 'Player-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)))
      on conflict do nothing;
    select * into v_p from public.profiles where uid = v_uid;
  end loop;
  select g.id into v_game from public.games g where g.status = 'active' and (g.p0 = v_uid or g.p1 = v_uid) limit 1;
  return jsonb_build_object('nickname', v_p.nickname, 'rating', v_p.rating, 'games', v_p.games,
    'wins', v_p.wins, 'losses', v_p.losses, 'draws', v_p.draws, 'game', v_game);
end $$;

create or replace function public.set_nickname(p_name text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := public.current_uid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then perform public.fail('not_authenticated'); end if;
  if char_length(v_name) < 1 or char_length(v_name) > 16 or v_name ~ '[[:cntrl:]]' then perform public.fail('nickname_invalid'); end if;
  begin
    update public.profiles set nickname = v_name where uid = v_uid;
  exception when unique_violation then
    perform public.fail('nickname_taken');
  end;
  if not found then perform public.fail('no_profile'); end if;
  return jsonb_build_object('nickname', v_name);
end $$;

-- VS Player lobby. p_wait = true keeps the caller on the waiting list (call every few seconds), false leaves it.
-- Returns the other waiting players and the caller's active game (set when someone has started a game with them).
create or replace function public.lobby_poll(p_wait boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := public.current_uid();
  v_game uuid;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.uid = v_uid) then
    perform public.fail('not_authenticated');
  end if;
  select g.id into v_game from public.games g where g.status = 'active' and (g.p0 = v_uid or g.p1 = v_uid) limit 1;
  if v_game is null and p_wait then
    insert into public.lobby (uid) values (v_uid) on conflict (uid) do update set seen_at = now();
  else
    delete from public.lobby where uid = v_uid;
  end if;
  delete from public.lobby where seen_at < now() - interval '10 minutes';
  return jsonb_build_object(
    'game', v_game,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('uid', l.uid, 'nickname', p.nickname, 'rating', p.rating) order by l.since)
      from public.lobby l join public.profiles p on p.uid = l.uid
      where l.uid <> v_uid and l.seen_at > now() - interval '12 seconds'
        and not exists (select 1 from public.games g where g.status = 'active' and (g.p0 = l.uid or g.p1 = l.uid))
    ), '[]'::jsonb));
end $$;

-- the caller's view of a game; the view itself only when it is newer than p_ver
create or replace function public.game_poll(p_game uuid, p_ver int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := public.current_uid();
  g     record;
begin
  select g0.p0, g0.p1, g0.ver, g0.view0, g0.view1 into g from public.games g0 where g0.id = p_game;
  if not found or v_uid is null or (g.p0 <> v_uid and g.p1 <> v_uid) then perform public.fail('not_found'); end if;
  return jsonb_build_object('ver', g.ver, 'now', floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    'view', case when g.ver > coalesce(p_ver, -1) then case when g.p0 = v_uid then g.view0 else g.view1 end end);
end $$;

-- top 100 by rating (players with at least one VS Player game) and the caller's own row
create or replace function public.ranking()
returns jsonb language sql stable security definer set search_path = '' as $$
  with r as (
    select p.uid, p.nickname, p.rating, p.games, p.wins, p.losses, p.draws,
           rank() over (order by p.rating desc) as rk
    from public.profiles p where p.games > 0
  )
  select jsonb_build_object(
    'top', coalesce((select jsonb_agg(jsonb_build_object('rank', t.rk, 'nickname', t.nickname, 'rating', t.rating,
              'wins', t.wins, 'losses', t.losses, 'draws', t.draws, 'me', t.uid = public.current_uid()) order by t.rk, t.nickname)
            from (select * from r order by rk, nickname limit 100) t), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', r.rk, 'nickname', r.nickname, 'rating', r.rating,
              'wins', r.wins, 'losses', r.losses, 'draws', r.draws) from r where r.uid = public.current_uid()));
$$;

revoke all on function public.current_uid(), public.fail(text), public.me(), public.set_nickname(text),
  public.lobby_poll(boolean), public.game_poll(uuid, int), public.ranking() from public, anonymous, authenticated;
grant execute on function public.me(), public.set_nickname(text), public.lobby_poll(boolean),
  public.game_poll(uuid, int), public.ranking() to authenticated;

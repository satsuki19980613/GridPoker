-- Delete games 7 days after their last change (2026-10-02 さつき「7日で削除」).
-- Finished games: 7 days after the end. Abandoned games (no move for 7 days): deleted too, without rating changes.
-- No scheduler: the purge runs when the app is used (me() on every sign-in / app start, lobby_poll now and then),
-- which is also the only time new games are created.

create index games_updated_idx on public.games (updated_at);

create or replace function public.purge_old_games()
returns void language sql volatile security definer set search_path = '' as $$
  delete from public.games where updated_at < now() - interval '7 days';
$$;

-- me(): same as before, plus the purge
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
  perform public.purge_old_games();
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

-- lobby_poll(): same as before, plus the purge on about 1 call in 20 (waiting players call it every 2 seconds)
create or replace function public.lobby_poll(p_wait boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := public.current_uid();
  v_game uuid;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.uid = v_uid) then
    perform public.fail('not_authenticated');
  end if;
  if random() < 0.05 then perform public.purge_old_games(); end if;
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

revoke all on function public.purge_old_games() from public, anonymous, authenticated;
revoke all on function public.me(), public.lobby_poll(boolean) from public, anonymous;
grant execute on function public.me(), public.lobby_poll(boolean) to authenticated;

-- Keep no personal data from sign-in in the database (the operator cannot see it in the Neon console either).
-- Same approach as privatematch (2026-10-11 さつき). Applied migrations are never rewritten; this one only adds.
--   Neon Auth writes the Google sign-in to neon_auth."user" (email, name, image), neon_auth.account (Google tokens)
--   and neon_auth.session (IP address, browser). The app uses none of them: the name shown is profiles.nickname, and
--   later sign-ins find the person by account."accountId".
--   user:    email → <id>@gridpoker.invalid (still unique, not a real address), name → 'Player', image → null
--   account: "idToken" (contains the email address), "accessToken" / "refreshToken" (Google would tell the address) → null
--   session: "ipAddress" / "userAgent" → null
--   Triggers replace the values on every write, whoever writes them. Rows already stored are replaced too (cannot be undone).

create function public.auth_user_scrub()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.email := new.id::text || '@gridpoker.invalid';
  new.name := 'Player';
  new.image := null;
  return new;
end $$;

create function public.auth_account_scrub()
returns trigger language plpgsql set search_path = '' as $$
begin
  new."idToken" := null;
  new."accessToken" := null;
  new."refreshToken" := null;
  return new;
end $$;

create function public.auth_session_scrub()
returns trigger language plpgsql set search_path = '' as $$
begin
  new."ipAddress" := null;
  new."userAgent" := null;
  return new;
end $$;

revoke all on function public.auth_user_scrub(), public.auth_account_scrub(), public.auth_session_scrub()
  from public, anonymous, authenticated;

create trigger auth_user_scrub before insert or update on neon_auth."user"
  for each row execute function public.auth_user_scrub();
create trigger auth_account_scrub before insert or update on neon_auth.account
  for each row execute function public.auth_account_scrub();
create trigger auth_session_scrub before insert or update on neon_auth.session
  for each row execute function public.auth_session_scrub();

update neon_auth."user" set email = id::text || '@gridpoker.invalid', name = 'Player', image = null
  where email is distinct from id::text || '@gridpoker.invalid' or name is distinct from 'Player' or image is not null;
update neon_auth.account set "idToken" = null, "accessToken" = null, "refreshToken" = null
  where "idToken" is not null or "accessToken" is not null or "refreshToken" is not null;
update neon_auth.session set "ipAddress" = null, "userAgent" = null
  where "ipAddress" is not null or "userAgent" is not null;

-- A local Postgres shaped like Neon for the database tests (CI and `TEST_DATABASE_URL=... npm test`):
-- the Data API roles and the neon_auth tables Neon Auth creates (only the columns the migrations and tests touch).
-- One user is stored before the migrations, to check that the migrations scrub rows already there.
create role anonymous;
create role authenticated;
create schema neon_auth;
create table neon_auth."user"(id uuid primary key, email text not null unique, name text not null, image text,
  "emailVerified" boolean not null default false, "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now());
create table neon_auth.account(id uuid primary key default gen_random_uuid(), "accountId" text not null, "providerId" text not null,
  "userId" uuid not null references neon_auth."user"(id) on delete cascade, "idToken" text, "accessToken" text, "refreshToken" text);
create table neon_auth.session(id uuid primary key default gen_random_uuid(), "userId" uuid not null references neon_auth."user"(id) on delete cascade,
  token text not null default md5(random()::text), "ipAddress" text, "userAgent" text);
insert into neon_auth."user"(id, email, name, image) values ('00000000-0000-4000-8000-0000000000b0', 'before@example.com', 'Before Migration', 'https://example.com/a.png');
insert into neon_auth.account("accountId", "providerId", "userId", "idToken", "accessToken", "refreshToken")
  values ('google-before', 'google', '00000000-0000-4000-8000-0000000000b0', 'id', 'access', 'refresh');
insert into neon_auth.session("userId", "ipAddress", "userAgent") values ('00000000-0000-4000-8000-0000000000b0', '203.0.113.1', 'Browser/1.0');

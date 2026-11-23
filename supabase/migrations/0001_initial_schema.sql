-- PocketArcade Phase 2 schema (reviewed local migration; not yet applied).
-- Game and save bytes belong in private Cloudflare R2, never in PostgreSQL.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  console text not null check (console in ('gb', 'gbc', 'gba', 'nds', 'n64')),
  file_name text not null check (char_length(file_name) between 1 and 255),
  is_favorite boolean not null default false,
  object_key text not null unique,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 900000000),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_played_at timestamptz,
  unique (id, user_id)
);

-- size_bytes is a per-object upper bound, not the aggregate 900 MB/user quota.
-- Phase 3 must reserve aggregate committed + pending bytes transactionally in trusted code.

create index if not exists games_user_created_idx
  on public.games (user_id, created_at desc);
create index if not exists games_user_console_idx
  on public.games (user_id, console);
create index if not exists games_user_hash_idx
  on public.games (user_id, sha256);

create table if not exists public.upload_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  object_key text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  title text not null check (char_length(title) between 1 and 160),
  console text not null check (console in ('gb', 'gbc', 'gba', 'nds', 'n64')),
  expected_size_bytes bigint not null check (expected_size_bytes > 0 and expected_size_bytes <= 900000000),
  status text not null default 'pending'
    check (status in ('pending', 'uploaded', 'completed', 'failed', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists upload_sessions_user_status_idx
  on public.upload_sessions (user_id, status, expires_at);

create table if not exists public.saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null,
  save_kind text not null check (save_kind in ('battery', 'state')),
  revision bigint not null check (revision > 0),
  object_key text not null unique,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  core_id text,
  core_version text,
  created_at timestamptz not null default now(),
  foreign key (game_id, user_id) references public.games (id, user_id) on delete cascade,
  unique (game_id, save_kind, revision)
);

create index if not exists saves_user_game_created_idx
  on public.saves (user_id, game_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.upload_sessions enable row level security;
alter table public.saves enable row level security;

-- Admin-created invitations are the server-trusted authorization marker.
-- This field is maintained by Supabase Auth, not user-editable metadata.
create or replace function public.is_invited_pixzer_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as invited_user
    where invited_user.id = (select auth.uid())
      and invited_user.invited_at is not null
  );
$$;

revoke all on function public.is_invited_pixzer_user() from public, anon, authenticated;
grant execute on function public.is_invited_pixzer_user() to authenticated;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select to authenticated using (
    (select auth.uid()) = id and (select public.is_invited_pixzer_user())
  );
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update to authenticated using (
    (select auth.uid()) = id and (select public.is_invited_pixzer_user())
  )
  with check (
    (select auth.uid()) = id and (select public.is_invited_pixzer_user())
  );

drop policy if exists "Users can read own games" on public.games;
create policy "Users can read own games" on public.games
  for select to authenticated using (
    (select auth.uid()) = user_id and (select public.is_invited_pixzer_user())
  );
drop policy if exists "Users can update own game favorite" on public.games;
create policy "Users can update own game favorite" on public.games
  for update to authenticated using (
    (select auth.uid()) = user_id and (select public.is_invited_pixzer_user())
  )
  with check (
    (select auth.uid()) = user_id and (select public.is_invited_pixzer_user())
  );
-- Column grants below restrict this policy to is_favorite only. Game creation,
-- object mutation, and deletion are server-mediated with R2/quota coordination.

drop policy if exists "Users can read own upload sessions" on public.upload_sessions;
create policy "Users can read own upload sessions" on public.upload_sessions
  for select to authenticated using (
    (select auth.uid()) = user_id and (select public.is_invited_pixzer_user())
  );
-- Upload state transitions are server-only; clients cannot mint keys or complete uploads.

drop policy if exists "Users can read own saves" on public.saves;
create policy "Users can read own saves" on public.saves
  for select to authenticated using (
    (select auth.uid()) = user_id and (select public.is_invited_pixzer_user())
  );
-- Save metadata writes are server-mediated; verify ownership before signing R2 access.

-- RLS is not a substitute for SQL privileges. Start from no client access and
-- grant only the intended operations; no anonymous access is needed.
revoke all privileges on table public.profiles, public.games,
  public.upload_sessions, public.saves from public, anon, authenticated;

grant select on table public.profiles, public.games,
  public.upload_sessions, public.saves to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant update (is_favorite) on table public.games to authenticated;

-- No auth.users profile trigger is installed in this phase. Provisioning is
-- intentionally deferred until an invite lifecycle is selected and reviewed.
-- Do not grant service_role or expose its key in browser bundles.

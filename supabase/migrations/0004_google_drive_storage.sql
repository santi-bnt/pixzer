-- Proposal only. Requires 0003_private_game_uploads.sql and explicit approval.
-- Drive tokens are encrypted by the server before they are written here.

alter table public.games
  add column if not exists storage_provider text not null default 'r2',
  add column if not exists provider_file_id text,
  add column if not exists provider_account_id text,
  add column if not exists provider_checksum text;

-- Drive reports a provider-computed MD5, not SHA-256. Never trust a browser
-- supplied digest as proof of what was persisted. R2 keeps its SHA-256 field.
alter table public.games alter column sha256 drop not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.games'::regclass
      and conname = 'games_storage_provider_check'
  ) then
    alter table public.games
      add constraint games_storage_provider_check
      check (storage_provider in ('r2', 'google_drive'));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.games'::regclass
      and conname = 'games_provider_locator_check'
  ) then
    alter table public.games
      add constraint games_provider_locator_check
      check (
        (storage_provider = 'r2' and provider_file_id is null and provider_account_id is null)
        or (storage_provider = 'google_drive' and provider_file_id is not null and provider_account_id is not null)
      );
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.games'::regclass
      and conname = 'games_provider_checksum_check'
  ) then
    alter table public.games
      add constraint games_provider_checksum_check
      check (
        (storage_provider = 'r2' and sha256 is not null and provider_checksum is null)
        or (storage_provider = 'google_drive' and sha256 is null and provider_checksum is not null and provider_checksum ~ '^[a-f0-9]{32}$')
      );
  end if;
end;
$$;

create unique index if not exists games_drive_provider_file_idx
  on public.games (provider_account_id, provider_file_id)
  where storage_provider = 'google_drive';

create table if not exists public.drive_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  drive_permission_id text not null,
  refresh_token_ciphertext text,
  refresh_token_nonce text,
  refresh_token_tag text,
  token_key_version smallint,
  granted_scope text not null check (granted_scope = 'https://www.googleapis.com/auth/drive.file'),
  connected_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    (refresh_token_ciphertext is null and refresh_token_nonce is null and refresh_token_tag is null and token_key_version is null and connected_at is null)
    or (refresh_token_ciphertext is not null and refresh_token_nonce is not null and refresh_token_tag is not null and token_key_version = 1 and connected_at is not null)
  )
);

create table if not exists public.drive_upload_sessions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null default pg_catalog.gen_random_uuid(),
  idempotency_key uuid not null,
  file_name text not null check (pg_catalog.char_length(file_name) between 1 and 255),
  title text not null check (pg_catalog.char_length(title) between 1 and 160),
  console text not null check (console in ('gb', 'gbc', 'gba', 'nds', 'n64')),
  expected_size_bytes bigint not null check (expected_size_bytes between 1 and 900000000),
  drive_permission_id text not null,
  resumable_uri_ciphertext text,
  resumable_uri_nonce text,
  resumable_uri_tag text,
  status text not null default 'pending' check (status in ('pending', 'uploading', 'completed', 'failed', 'expired')),
  expires_at timestamptz not null,
  object_cleanup_completed_at timestamptz,
  cleanup_claim_id uuid,
  cleanup_claimed_at timestamptz,
  cleanup_attempts integer not null default 0 check (cleanup_attempts >= 0),
  cleanup_next_attempt_at timestamptz,
  cleanup_manual_review_at timestamptz,
  cleanup_last_result text check (cleanup_last_result in (
    'confirmed_absent', 'confirmed_trashed', 'verified_complete',
    'provider_temporary', 'provider_unavailable', 'authorization_revoked',
    'ambiguous_file_state'
  )),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (game_id, user_id),
  check (
    (resumable_uri_ciphertext is null and resumable_uri_nonce is null and resumable_uri_tag is null)
    or (resumable_uri_ciphertext is not null and resumable_uri_nonce is not null and resumable_uri_tag is not null)
  ),
  check ((cleanup_claim_id is null) = (cleanup_claimed_at is null))
);

create unique index if not exists drive_upload_sessions_idempotency_idx
  on public.drive_upload_sessions (user_id, idempotency_key);
create index if not exists drive_upload_sessions_quota_idx
  on public.drive_upload_sessions (user_id, status, expires_at);
create index if not exists drive_upload_sessions_cleanup_quota_idx
  on public.drive_upload_sessions (user_id, object_cleanup_completed_at)
  where status <> 'completed' and object_cleanup_completed_at is null;

alter table public.drive_connections enable row level security;
alter table public.drive_upload_sessions enable row level security;
revoke all on public.drive_connections, public.drive_upload_sessions from public, anon, authenticated;
grant all on public.drive_connections, public.drive_upload_sessions to service_role;

create or replace function public.reserve_drive_game_upload(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_file_name text,
  p_title text,
  p_console text,
  p_expected_size_bytes bigint
)
returns table (reserved_upload_id uuid, reserved_game_id uuid, reserved_expires_at timestamptz, reserved_status text, drive_permission_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_session public.drive_upload_sessions%rowtype;
  account_id text;
  new_upload_id uuid := pg_catalog.gen_random_uuid();
  new_game_id uuid := pg_catalog.gen_random_uuid();
  new_expiration timestamptz := pg_catalog.clock_timestamp() + interval '7 days';
begin
  if p_user_id is null or p_idempotency_key is null or p_file_name is null or p_title is null
    or p_console is null or p_expected_size_bytes is null
    or pg_catalog.char_length(p_file_name) not between 1 and 255
    or pg_catalog.char_length(p_title) not between 1 and 160
    or p_file_name ~ '[\\/[:cntrl:]]'
    or p_console not in ('gb', 'gbc', 'gba', 'nds', 'n64')
    or p_expected_size_bytes < 1 or p_expected_size_bytes > 900000000 then
    raise exception 'Invalid Drive upload reservation' using errcode = '22023';
  end if;

  if not (
    (p_console = 'gb' and pg_catalog.lower(p_file_name) ~ '\.gb$')
    or (p_console = 'gbc' and pg_catalog.lower(p_file_name) ~ '\.gbc$')
    or (p_console = 'gba' and pg_catalog.lower(p_file_name) ~ '\.gba$')
    or (p_console = 'nds' and pg_catalog.lower(p_file_name) ~ '\.nds$')
    or (p_console = 'n64' and pg_catalog.lower(p_file_name) ~ '\.(n64|z64|v64)$')
  ) then
    raise exception 'Unsupported console and file extension' using errcode = '22023';
  end if;

  if not exists (
    select 1 from auth.users as invited_user
    where invited_user.id = p_user_id and invited_user.invited_at is not null
  ) then
    raise exception 'Invited account required' using errcode = '42501';
  end if;

  -- Coordinate with the existing R2 reservation RPC's shared lock. R2 remains
  -- disabled while Drive is selected, but both providers share the account cap.
  perform pg_catalog.pg_advisory_xact_lock(740031, 1);

  if not exists (
    select 1 from auth.users as invited_user
    where invited_user.id = p_user_id and invited_user.invited_at is not null
  ) then
    raise exception 'Invited account required' using errcode = '42501';
  end if;

  select connection.drive_permission_id into account_id
  from public.drive_connections as connection
  where connection.user_id = p_user_id and connection.refresh_token_ciphertext is not null
  for update;
  if not found then
    raise exception 'Google Drive is not connected' using errcode = '55000';
  end if;

  select session.* into existing_session
  from public.drive_upload_sessions as session
  where session.user_id = p_user_id and session.idempotency_key = p_idempotency_key
  for update;
  if found then
    if existing_session.file_name <> p_file_name or existing_session.title <> p_title
      or existing_session.console <> p_console or existing_session.expected_size_bytes <> p_expected_size_bytes then
      raise exception 'Drive upload idempotency key reused with different metadata' using errcode = '22023';
    end if;
    return query select existing_session.id, existing_session.game_id, existing_session.expires_at, existing_session.status, existing_session.drive_permission_id;
    return;
  end if;

  if (select pg_catalog.count(*) from public.drive_upload_sessions as session
      where session.user_id = p_user_id and session.status in ('pending', 'uploading')
        and session.expires_at > pg_catalog.clock_timestamp()
        and session.object_cleanup_completed_at is null) >= 2 then
    raise exception 'Too many active Drive uploads' using errcode = '23514';
  end if;

  -- Shared helper counts committed games and uncleared holds for both providers.
  perform public.assert_game_storage_quota(p_user_id, p_expected_size_bytes);

  insert into public.drive_upload_sessions (
    id, user_id, game_id, idempotency_key, file_name, title, console,
    expected_size_bytes, drive_permission_id, status, expires_at
  ) values (
    new_upload_id, p_user_id, new_game_id, p_idempotency_key, p_file_name, p_title, p_console,
    p_expected_size_bytes, account_id, 'pending', new_expiration
  );

  return query select new_upload_id, new_game_id, new_expiration, 'pending'::text, account_id;
end;
$$;

create or replace function public.complete_drive_game_upload(
  p_user_id uuid,
  p_upload_id uuid,
  p_drive_file_id text,
  p_verified_size_bytes bigint,
  p_md5_checksum text
)
returns table (completed_game_id uuid, completed_size_bytes bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  upload public.drive_upload_sessions%rowtype;
  completed_game public.games%rowtype;
begin
  if p_user_id is null or p_upload_id is null or p_drive_file_id is null
    or pg_catalog.char_length(p_drive_file_id) not between 1 and 256
    or p_verified_size_bytes is null or p_verified_size_bytes < 1
    or p_md5_checksum is null or p_md5_checksum !~ '^[a-f0-9]{32}$' then
    raise exception 'Invalid verified Drive upload metadata' using errcode = '22023';
  end if;

  select session.* into upload from public.drive_upload_sessions as session
  where session.id = p_upload_id and session.user_id = p_user_id for update;
  if not found then raise exception 'Drive upload unavailable' using errcode = '42501'; end if;

  if upload.status = 'completed' then
    select game.* into completed_game
    from public.games as game
    where game.id = upload.game_id and game.user_id = p_user_id
    for update;
    if not found then
      raise exception 'Completed Drive upload has no associated game record'
        using errcode = 'P0002';
    end if;
    if completed_game.storage_provider <> 'google_drive'
      or completed_game.provider_file_id <> p_drive_file_id
      or completed_game.provider_account_id <> upload.drive_permission_id
      or upload.expected_size_bytes <> p_verified_size_bytes
      or completed_game.size_bytes <> p_verified_size_bytes
      or completed_game.provider_checksum <> pg_catalog.lower(p_md5_checksum)
      or completed_game.object_key <> 'google-drive/' || p_user_id::text || '/' || p_drive_file_id
    then
      raise exception 'Completed Drive upload metadata does not match the stored game'
        using errcode = '22023';
    end if;
    return query select completed_game.id, completed_game.size_bytes;
    return;
  end if;
  if upload.status not in ('pending', 'uploading') or upload.expires_at <= pg_catalog.clock_timestamp()
    or upload.expected_size_bytes <> p_verified_size_bytes then
    raise exception 'Drive upload is not eligible for completion' using errcode = '22023';
  end if;
  if not exists (
    select 1 from auth.users as invited_user
    where invited_user.id = p_user_id and invited_user.invited_at is not null
  ) then
    raise exception 'Invited account required' using errcode = '42501';
  end if;

  insert into public.games (
    id, user_id, title, console, file_name, object_key, size_bytes, sha256,
    storage_provider, provider_file_id, provider_account_id, provider_checksum
  ) values (
    upload.game_id, p_user_id, upload.title, upload.console, upload.file_name,
    'google-drive/' || p_user_id::text || '/' || p_drive_file_id,
    p_verified_size_bytes, null, 'google_drive', p_drive_file_id, upload.drive_permission_id, pg_catalog.lower(p_md5_checksum)
  );

  update public.drive_upload_sessions set status = 'completed', updated_at = pg_catalog.clock_timestamp()
  where id = upload.id;
  return query select upload.game_id, p_verified_size_bytes;
end;
$$;

-- Claim expired reservations for a privileged reconciliation worker. The
-- worker must verify the owner's Drive account and provider state before it
-- resolves a quota hold.
create or replace function public.claim_expired_drive_upload_cleanup(
  p_batch_size integer default 25
)
returns table (
  cleanup_claim_id uuid,
  upload_id uuid,
  user_id uuid,
  game_id uuid,
  file_name text,
  expected_size_bytes bigint,
  cleanup_attempts integer,
  drive_permission_id text,
  resumable_uri_ciphertext text,
  resumable_uri_nonce text,
  resumable_uri_tag text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_batch_size is null or p_batch_size not between 1 and 100 then
    raise exception 'Invalid Drive cleanup batch size' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select session.id
    from public.drive_upload_sessions as session
    where session.status in ('pending', 'uploading', 'failed', 'expired')
      and session.expires_at <= pg_catalog.clock_timestamp()
      and session.object_cleanup_completed_at is null
      and session.cleanup_manual_review_at is null
      and (session.cleanup_next_attempt_at is null
        or session.cleanup_next_attempt_at <= pg_catalog.clock_timestamp())
      and (session.cleanup_claimed_at is null
        or session.cleanup_claimed_at <= pg_catalog.clock_timestamp() - interval '15 minutes')
    order by session.expires_at, session.id
    limit p_batch_size
    for update skip locked
  ), claimed as (
    update public.drive_upload_sessions as session
    set status = 'expired',
        cleanup_claim_id = pg_catalog.gen_random_uuid(),
        cleanup_claimed_at = pg_catalog.clock_timestamp(),
        cleanup_attempts = session.cleanup_attempts + 1,
        cleanup_next_attempt_at = null,
        updated_at = pg_catalog.clock_timestamp()
    from candidates
    where session.id = candidates.id
    returning session.*
  )
  select claimed.cleanup_claim_id, claimed.id, claimed.user_id, claimed.game_id,
         claimed.file_name, claimed.expected_size_bytes, claimed.cleanup_attempts, claimed.drive_permission_id,
         claimed.resumable_uri_ciphertext, claimed.resumable_uri_nonce, claimed.resumable_uri_tag
  from claimed;
end;
$$;

-- Register a file discovered after the upload completion response was lost.
-- The server may call this only after verifying account, app marker, size and MD5.
create or replace function public.complete_reconciled_drive_game_upload(
  p_user_id uuid,
  p_upload_id uuid,
  p_cleanup_claim_id uuid,
  p_drive_file_id text,
  p_verified_size_bytes bigint,
  p_md5_checksum text
)
returns table (completed_game_id uuid, completed_size_bytes bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  upload public.drive_upload_sessions%rowtype;
begin
  select session.* into upload
  from public.drive_upload_sessions as session
  where session.id = p_upload_id and session.user_id = p_user_id
  for update;
  if not found then
    raise exception 'Drive upload unavailable' using errcode = '42501';
  end if;

  if upload.status = 'completed' then
    return query select * from public.complete_drive_game_upload(
      p_user_id, p_upload_id, p_drive_file_id, p_verified_size_bytes, p_md5_checksum
    );
    return;
  end if;

  if upload.status <> 'expired'
    or upload.expires_at > pg_catalog.clock_timestamp()
    or upload.cleanup_claim_id is distinct from p_cleanup_claim_id
    or upload.cleanup_claimed_at is null
    or upload.cleanup_claimed_at <= pg_catalog.clock_timestamp() - interval '15 minutes'
  then
    raise exception 'Drive cleanup claim is unavailable' using errcode = '55000';
  end if;

  update public.drive_upload_sessions as session
  set status = 'uploading',
      expires_at = pg_catalog.clock_timestamp() + interval '5 minutes',
      cleanup_claim_id = null,
      cleanup_claimed_at = null,
      cleanup_last_result = 'verified_complete',
      updated_at = pg_catalog.clock_timestamp()
  where session.id = upload.id;

  return query select * from public.complete_drive_game_upload(
    p_user_id, p_upload_id, p_drive_file_id, p_verified_size_bytes, p_md5_checksum
  );
end;
$$;

-- Only confirmed provider absence or a confirmed trashed object releases quota.
create or replace function public.resolve_drive_upload_cleanup(
  p_user_id uuid,
  p_upload_id uuid,
  p_cleanup_claim_id uuid,
  p_resolution text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  upload public.drive_upload_sessions%rowtype;
begin
  if p_resolution is null or p_resolution not in ('confirmed_absent', 'confirmed_trashed') then
    raise exception 'Invalid Drive cleanup resolution' using errcode = '22023';
  end if;

  select session.* into upload
  from public.drive_upload_sessions as session
  where session.id = p_upload_id and session.user_id = p_user_id
  for update;
  if not found then
    raise exception 'Drive upload unavailable' using errcode = '42501';
  end if;
  if upload.object_cleanup_completed_at is not null then
    if upload.cleanup_last_result = p_resolution then
      return true;
    end if;
    raise exception 'Drive cleanup was already resolved differently' using errcode = '22023';
  end if;
  if upload.status <> 'expired'
    or upload.expires_at > pg_catalog.clock_timestamp()
    or upload.cleanup_claim_id is distinct from p_cleanup_claim_id
    or upload.cleanup_claimed_at is null
    or upload.cleanup_claimed_at <= pg_catalog.clock_timestamp() - interval '15 minutes'
  then
    raise exception 'Drive cleanup claim is unavailable' using errcode = '55000';
  end if;

  update public.drive_upload_sessions as session
  set object_cleanup_completed_at = pg_catalog.clock_timestamp(),
      cleanup_claim_id = null,
      cleanup_claimed_at = null,
      cleanup_next_attempt_at = null,
      cleanup_last_result = p_resolution,
      updated_at = pg_catalog.clock_timestamp()
  where session.id = upload.id;
  return true;
end;
$$;

-- Retry transient errors. Revoked authorization or ambiguous provider state
-- goes to manual review and retains the quota hold.
create or replace function public.defer_drive_upload_cleanup(
  p_user_id uuid,
  p_upload_id uuid,
  p_cleanup_claim_id uuid,
  p_reason text,
  p_retry_after_seconds integer,
  p_manual_review boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if p_reason is null or p_manual_review is null
    or p_reason not in ('provider_temporary', 'provider_unavailable', 'authorization_revoked', 'ambiguous_file_state')
    or p_retry_after_seconds is null or p_retry_after_seconds not between 60 and 604800 then
    raise exception 'Invalid Drive cleanup deferral' using errcode = '22023';
  end if;

  update public.drive_upload_sessions as session
  set cleanup_claim_id = null,
      cleanup_claimed_at = null,
      cleanup_next_attempt_at = case when p_manual_review then null
        else pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_retry_after_seconds) end,
      cleanup_manual_review_at = case when p_manual_review then pg_catalog.clock_timestamp() else null end,
      cleanup_last_result = p_reason,
      updated_at = pg_catalog.clock_timestamp()
  where session.id = p_upload_id
    and session.user_id = p_user_id
    and session.status = 'expired'
    and session.object_cleanup_completed_at is null
    and session.cleanup_claim_id = p_cleanup_claim_id
    and session.cleanup_claimed_at > pg_catalog.clock_timestamp() - interval '15 minutes';

  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'Drive cleanup claim is unavailable' using errcode = '55000';
  end if;
  return true;
end;
$$;

create or replace function public.release_drive_upload_manual_review(
  p_user_id uuid,
  p_upload_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  update public.drive_upload_sessions as session
  set cleanup_manual_review_at = null,
      cleanup_next_attempt_at = pg_catalog.clock_timestamp(),
      cleanup_last_result = 'provider_unavailable',
      updated_at = pg_catalog.clock_timestamp()
  where session.id = p_upload_id
    and session.user_id = p_user_id
    and session.status = 'expired'
    and session.object_cleanup_completed_at is null
    and session.cleanup_manual_review_at is not null;
  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

alter function public.reserve_drive_game_upload(uuid, uuid, text, text, text, bigint) owner to postgres;
alter function public.complete_drive_game_upload(uuid, uuid, text, bigint, text) owner to postgres;
alter function public.claim_expired_drive_upload_cleanup(integer) owner to postgres;
alter function public.complete_reconciled_drive_game_upload(uuid, uuid, uuid, text, bigint, text) owner to postgres;
alter function public.resolve_drive_upload_cleanup(uuid, uuid, uuid, text) owner to postgres;
alter function public.defer_drive_upload_cleanup(uuid, uuid, uuid, text, integer, boolean) owner to postgres;
alter function public.release_drive_upload_manual_review(uuid, uuid) owner to postgres;

revoke all on function public.reserve_drive_game_upload(uuid, uuid, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.complete_drive_game_upload(uuid, uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.reserve_drive_game_upload(uuid, uuid, text, text, text, bigint) to service_role;
grant execute on function public.complete_drive_game_upload(uuid, uuid, text, bigint, text) to service_role;
revoke all on function public.claim_expired_drive_upload_cleanup(integer) from public, anon, authenticated;
revoke all on function public.complete_reconciled_drive_game_upload(uuid, uuid, uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.resolve_drive_upload_cleanup(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.defer_drive_upload_cleanup(uuid, uuid, uuid, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.release_drive_upload_manual_review(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_expired_drive_upload_cleanup(integer) to service_role;
grant execute on function public.complete_reconciled_drive_game_upload(uuid, uuid, uuid, text, bigint, text) to service_role;
grant execute on function public.resolve_drive_upload_cleanup(uuid, uuid, uuid, text) to service_role;
grant execute on function public.defer_drive_upload_cleanup(uuid, uuid, uuid, text, integer, boolean) to service_role;
grant execute on function public.release_drive_upload_manual_review(uuid, uuid) to service_role;

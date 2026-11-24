-- Add server-mediated, quota-reserved game uploads. Existing RLS policies and
-- browser grants are intentionally unchanged. Apply only after review/approval.

alter table public.upload_sessions
  add column if not exists game_id uuid,
  add column if not exists idempotency_key uuid;

create unique index if not exists upload_sessions_user_idempotency_idx
  on public.upload_sessions (user_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists upload_sessions_game_id_idx
  on public.upload_sessions (game_id)
  where game_id is not null;

create or replace function public.reserve_game_upload(
  p_user_id uuid,
  p_file_name text,
  p_title text,
  p_console text,
  p_expected_size_bytes bigint,
  p_idempotency_key uuid
)
returns table (
  reserved_upload_id uuid,
  reserved_game_id uuid,
  staging_object_key text,
  reserved_expires_at timestamptz,
  reserved_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_session public.upload_sessions%rowtype;
  committed_user_bytes bigint;
  pending_user_bytes bigint;
  committed_global_bytes bigint;
  pending_global_bytes bigint;
  new_upload_id uuid := pg_catalog.gen_random_uuid();
  new_game_id uuid := pg_catalog.gen_random_uuid();
  new_object_key text;
  new_expiration timestamptz := pg_catalog.clock_timestamp() + interval '30 minutes';
begin
  if p_user_id is null
    or p_idempotency_key is null
    or p_file_name is null
    or p_title is null
    or p_console is null
    or p_expected_size_bytes is null
    or pg_catalog.char_length(p_file_name) not between 1 and 255
    or pg_catalog.char_length(p_title) not between 1 and 160
    or p_file_name ~ '[\\/[:cntrl:]]'
    or p_console not in ('gb', 'gbc', 'gba', 'nds', 'n64')
    or p_expected_size_bytes < 1
    or p_expected_size_bytes > 900000000
  then
    raise exception 'Invalid game upload reservation' using errcode = '22023';
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

  -- Serialize all quota reservations so both account and shared limits are race-safe.
  perform pg_catalog.pg_advisory_xact_lock(740031, 1);

  select upload.*
  into existing_session
  from public.upload_sessions as upload
  where upload.user_id = p_user_id
    and upload.idempotency_key = p_idempotency_key
  for update;

  if found then
    if existing_session.file_name <> p_file_name
      or existing_session.title <> p_title
      or existing_session.console <> p_console
      or existing_session.expected_size_bytes <> p_expected_size_bytes
    then
      raise exception 'Upload idempotency key was reused with different metadata'
        using errcode = '22023';
    end if;

    return query select
      existing_session.id,
      existing_session.game_id,
      existing_session.object_key,
      existing_session.expires_at,
      existing_session.status;
    return;
  end if;

  if (
    select pg_catalog.count(*)
    from public.upload_sessions as upload
    where upload.user_id = p_user_id
      and upload.status in ('pending', 'uploaded')
      and upload.expires_at > pg_catalog.clock_timestamp()
  ) >= 2 then
    raise exception 'Too many active game uploads' using errcode = '23514';
  end if;

  select coalesce(pg_catalog.sum(game.size_bytes), 0)
  into committed_user_bytes
  from public.games as game
  where game.user_id = p_user_id;

  select coalesce(pg_catalog.sum(upload.expected_size_bytes), 0)
  into pending_user_bytes
  from public.upload_sessions as upload
  where upload.user_id = p_user_id
    and upload.status in ('pending', 'uploaded')
    and upload.expires_at > pg_catalog.clock_timestamp();

  select coalesce(pg_catalog.sum(game.size_bytes), 0)
  into committed_global_bytes
  from public.games as game;

  select coalesce(pg_catalog.sum(upload.expected_size_bytes), 0)
  into pending_global_bytes
  from public.upload_sessions as upload
  where upload.status in ('pending', 'uploaded')
    and upload.expires_at > pg_catalog.clock_timestamp();

  if committed_user_bytes + pending_user_bytes + p_expected_size_bytes > 900000000 then
    raise exception 'User storage quota exceeded' using errcode = '23514';
  end if;

  if committed_global_bytes + pending_global_bytes + p_expected_size_bytes > 9000000000 then
    raise exception 'Shared storage reserve exceeded' using errcode = '23514';
  end if;

  new_object_key := 'users/' || p_user_id::text || '/games/' || new_game_id::text || '/rom/original';

  insert into public.upload_sessions (
    id,
    user_id,
    game_id,
    idempotency_key,
    object_key,
    file_name,
    title,
    console,
    expected_size_bytes,
    status,
    expires_at
  ) values (
    new_upload_id,
    p_user_id,
    new_game_id,
    p_idempotency_key,
    new_object_key,
    p_file_name,
    p_title,
    p_console,
    p_expected_size_bytes,
    'pending',
    new_expiration
  );

  return query select new_upload_id, new_game_id, new_object_key, new_expiration, 'pending'::text;
end;
$$;

create or replace function public.expire_game_upload(
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
  update public.upload_sessions as upload
  set status = 'expired', updated_at = pg_catalog.clock_timestamp()
  where upload.id = p_upload_id
    and upload.user_id = p_user_id
    and upload.status in ('pending', 'uploaded')
    and upload.expires_at <= pg_catalog.clock_timestamp();

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create or replace function public.complete_game_upload(
  p_user_id uuid,
  p_upload_id uuid,
  p_verified_size_bytes bigint,
  p_sha256 text
)
returns table (completed_game_id uuid, completed_size_bytes bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  upload public.upload_sessions%rowtype;
begin
  if p_user_id is null
    or p_upload_id is null
    or p_verified_size_bytes is null
    or p_sha256 is null
    or p_verified_size_bytes < 1
    or p_sha256 !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Invalid verified upload metadata' using errcode = '22023';
  end if;

  select session.*
  into upload
  from public.upload_sessions as session
  where session.id = p_upload_id
    and session.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Upload session unavailable' using errcode = '42501';
  end if;

  if upload.status = 'completed' then
    return query select game.id, game.size_bytes
      from public.games as game
      where game.id = upload.game_id and game.user_id = p_user_id;
    return;
  end if;

  if upload.status not in ('pending', 'uploaded')
    or upload.expires_at <= pg_catalog.clock_timestamp()
    or upload.expected_size_bytes <> p_verified_size_bytes
  then
    raise exception 'Upload session is not eligible for completion' using errcode = '22023';
  end if;

  if upload.object_key <> 'users/' || p_user_id::text || '/games/' || upload.game_id::text || '/rom/original' then
    raise exception 'Upload object key does not match its reservation' using errcode = '42501';
  end if;

  insert into public.games (
    id,
    user_id,
    title,
    console,
    file_name,
    object_key,
    size_bytes,
    sha256
  ) values (
    upload.game_id,
    p_user_id,
    upload.title,
    upload.console,
    upload.file_name,
    upload.object_key,
    p_verified_size_bytes,
    p_sha256
  );

  update public.upload_sessions as session
  set status = 'completed', updated_at = pg_catalog.clock_timestamp()
  where session.id = upload.id;

  return query select upload.game_id, p_verified_size_bytes;
end;
$$;

revoke all on function public.reserve_game_upload(uuid, text, text, text, bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.expire_game_upload(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_game_upload(uuid, uuid, bigint, text)
  from public, anon, authenticated;

grant execute on function public.reserve_game_upload(uuid, text, text, text, bigint, uuid)
  to service_role;
grant execute on function public.expire_game_upload(uuid, uuid)
  to service_role;
grant execute on function public.complete_game_upload(uuid, uuid, bigint, text)
  to service_role;

-- A single Google resumable session must not receive overlapping status probes
-- or data chunks from separate serverless instances. This is a short database
-- lease, not a transaction held open over the network transfer.
alter table public.drive_upload_sessions
  add column if not exists chunk_lease_id uuid,
  add column if not exists chunk_lease_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.drive_upload_sessions'::regclass
      and conname = 'drive_upload_chunk_lease_pair_check'
  ) then
    alter table public.drive_upload_sessions
      add constraint drive_upload_chunk_lease_pair_check
      check ((chunk_lease_id is null) = (chunk_lease_expires_at is null));
  end if;
end;
$$;

create index if not exists drive_upload_chunk_lease_expiry_idx
  on public.drive_upload_sessions (chunk_lease_expires_at)
  where chunk_lease_id is not null;

create or replace function public.acquire_drive_upload_chunk_lease(
  p_user_id uuid,
  p_upload_id uuid,
  p_lease_id uuid
)
returns table (acquired boolean, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if p_user_id is null or p_upload_id is null or p_lease_id is null then
    raise exception 'Invalid Drive upload lease request' using errcode = '22023';
  end if;

  return query
  update public.drive_upload_sessions as session
  set chunk_lease_id = p_lease_id,
      chunk_lease_expires_at = case
        when session.chunk_lease_id = p_lease_id
          and session.chunk_lease_expires_at > pg_catalog.clock_timestamp()
          then session.chunk_lease_expires_at
        else pg_catalog.clock_timestamp() + interval '6 minutes'
      end,
      updated_at = pg_catalog.clock_timestamp()
  where session.id = p_upload_id
    and session.user_id = p_user_id
    and session.status in ('pending', 'uploading')
    and session.expires_at > pg_catalog.clock_timestamp()
    and (session.chunk_lease_id is null
      or session.chunk_lease_expires_at <= pg_catalog.clock_timestamp()
      or session.chunk_lease_id = p_lease_id)
  returning true, session.chunk_lease_expires_at;

  get diagnostics changed_count = row_count;
  if changed_count = 0 then
    return query select false, null::timestamptz;
  end if;
end;
$$;

create or replace function public.release_drive_upload_chunk_lease(
  p_user_id uuid,
  p_upload_id uuid,
  p_lease_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if p_user_id is null or p_upload_id is null or p_lease_id is null then
    raise exception 'Invalid Drive upload lease release' using errcode = '22023';
  end if;

  update public.drive_upload_sessions as session
  set chunk_lease_id = null,
      chunk_lease_expires_at = null,
      updated_at = pg_catalog.clock_timestamp()
  where session.id = p_upload_id
    and session.user_id = p_user_id
    and session.chunk_lease_id = p_lease_id;

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

-- Expired-session reconciliation must not race an upload handler that still
-- holds a live chunk lease. Expiry permits recovery only after the lease ends.
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
      and (session.chunk_lease_id is null
        or session.chunk_lease_expires_at <= pg_catalog.clock_timestamp())
    order by session.expires_at, session.id
    limit p_batch_size
    for update skip locked
  ), claimed as (
    update public.drive_upload_sessions as session
    set status = 'expired',
        chunk_lease_id = null,
        chunk_lease_expires_at = null,
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

alter function public.acquire_drive_upload_chunk_lease(uuid, uuid, uuid) owner to postgres;
alter function public.release_drive_upload_chunk_lease(uuid, uuid, uuid) owner to postgres;
alter function public.claim_expired_drive_upload_cleanup(integer) owner to postgres;

revoke all on function public.acquire_drive_upload_chunk_lease(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_drive_upload_chunk_lease(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_expired_drive_upload_cleanup(integer) from public, anon, authenticated;
grant execute on function public.acquire_drive_upload_chunk_lease(uuid, uuid, uuid) to service_role;
grant execute on function public.release_drive_upload_chunk_lease(uuid, uuid, uuid) to service_role;
grant execute on function public.claim_expired_drive_upload_cleanup(integer) to service_role;

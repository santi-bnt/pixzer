-- Transactional security and lease-state tests for the Google Drive proxy.
begin;
select plan(29);

select has_column('public', 'drive_upload_sessions', 'chunk_lease_id', 'upload rows store a lease owner token');
select has_column('public', 'drive_upload_sessions', 'chunk_lease_expires_at', 'upload rows store lease expiry');
select ok(exists (
  select 1 from pg_catalog.pg_constraint
  where conrelid = 'public.drive_upload_sessions'::regclass
    and conname = 'drive_upload_chunk_lease_pair_check'
), 'lease owner and expiry must be set or cleared together');
select has_function('public', 'acquire_drive_upload_chunk_lease', array['uuid', 'uuid', 'uuid'], 'atomic lease acquisition exists');
select has_function('public', 'release_drive_upload_chunk_lease', array['uuid', 'uuid', 'uuid'], 'owner-checked lease release exists');
select has_function('public', 'claim_expired_drive_upload_cleanup', array['integer'], 'expired cleanup claimant exists');
select ok((select prosecdef and proconfig @> array['search_path=""'] and pg_catalog.pg_get_userbyid(proowner) = 'postgres'
  from pg_catalog.pg_proc where oid = 'public.acquire_drive_upload_chunk_lease(uuid,uuid,uuid)'::regprocedure),
  'acquire RPC is postgres-owned SECURITY DEFINER with empty search_path');
select ok((select prosecdef and proconfig @> array['search_path=""'] and pg_catalog.pg_get_userbyid(proowner) = 'postgres'
  from pg_catalog.pg_proc where oid = 'public.release_drive_upload_chunk_lease(uuid,uuid,uuid)'::regprocedure),
  'release RPC is postgres-owned SECURITY DEFINER with empty search_path');
select ok((select prosecdef and proconfig @> array['search_path=""'] and pg_catalog.pg_get_userbyid(proowner) = 'postgres'
  from pg_catalog.pg_proc where oid = 'public.claim_expired_drive_upload_cleanup(integer)'::regprocedure),
  'cleanup claimant remains postgres-owned SECURITY DEFINER with empty search_path');
select ok(has_function_privilege('service_role', 'public.acquire_drive_upload_chunk_lease(uuid,uuid,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.release_drive_upload_chunk_lease(uuid,uuid,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.claim_expired_drive_upload_cleanup(integer)', 'EXECUTE'),
  'service_role can acquire, release and reconcile leases');
select ok(not has_function_privilege('authenticated', 'public.acquire_drive_upload_chunk_lease(uuid,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.release_drive_upload_chunk_lease(uuid,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_expired_drive_upload_cleanup(integer)', 'EXECUTE'),
  'browser roles cannot control upload or cleanup leases');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.drive_upload_sessions'::regclass),
  'Drive upload session RLS remains enabled');

insert into auth.users (id, email, invited_at, raw_user_meta_data) values
  ('a5555555-5555-4555-8555-555555555551', 'lease-owner@example.invalid', pg_catalog.now(), '{}'::jsonb),
  ('a5555555-5555-4555-8555-555555555552', 'lease-other@example.invalid', pg_catalog.now(), '{}'::jsonb),
  ('a5555555-5555-4555-8555-555555555553', 'lease-uninvited@example.invalid', null, '{"invited_at":"2099-01-01"}'::jsonb);

insert into public.drive_upload_sessions (
  id, user_id, game_id, idempotency_key, file_name, title, console,
  expected_size_bytes, drive_permission_id, resumable_uri_ciphertext,
  resumable_uri_nonce, resumable_uri_tag, status, expires_at
) values (
  'a5555555-5555-4555-8555-555555555561',
  'a5555555-5555-4555-8555-555555555551',
  'a5555555-5555-4555-8555-555555555571',
  'a5555555-5555-4555-8555-555555555581',
  'lease-test.gb', 'Lease test', 'gb', 1024, 'lease-owner',
  'synthetic-ciphertext', 'synthetic-nonce', 'synthetic-tag', 'uploading',
  pg_catalog.clock_timestamp() + interval '1 day'
);

select is((select acquired from public.acquire_drive_upload_chunk_lease(
  'a5555555-5555-4555-8555-555555555551', 'a5555555-5555-4555-8555-555555555561',
  'a5555555-5555-4555-8555-555555555591'
)), true, 'the owning server can acquire a lease');
select ok((select lease_expires_at > pg_catalog.clock_timestamp()
  and lease_expires_at <= pg_catalog.clock_timestamp() + interval '7 minutes'
  from public.acquire_drive_upload_chunk_lease(
    'a5555555-5555-4555-8555-555555555551', 'a5555555-5555-4555-8555-555555555561',
    'a5555555-5555-4555-8555-555555555591'
  )), 'same owner token retry is idempotent and does not create a second lease');
select is((select acquired from public.acquire_drive_upload_chunk_lease(
  'a5555555-5555-4555-8555-555555555551', 'a5555555-5555-4555-8555-555555555561',
  'a5555555-5555-4555-8555-555555555592'
)), false, 'a second simultaneous request cannot acquire the same session');
select is((select acquired from public.acquire_drive_upload_chunk_lease(
  'a5555555-5555-4555-8555-555555555552', 'a5555555-5555-4555-8555-555555555561',
  'a5555555-5555-4555-8555-555555555593'
)), false, 'another user cannot acquire the owner session lease');
select is(public.release_drive_upload_chunk_lease(
  'a5555555-5555-4555-8555-555555555552', 'a5555555-5555-4555-8555-555555555561',
  'a5555555-5555-4555-8555-555555555591'
), false, 'another user cannot release the owner lease');
select is(public.release_drive_upload_chunk_lease(
  'a5555555-5555-4555-8555-555555555551', 'a5555555-5555-4555-8555-555555555561',
  'a5555555-5555-4555-8555-555555555592'
), false, 'a stale or non-owner lease token cannot release the active lease');
select is(public.release_drive_upload_chunk_lease(
  'a5555555-5555-4555-8555-555555555551', 'a5555555-5555-4555-8555-555555555561',
  'a5555555-5555-4555-8555-555555555591'
), true, 'the current lease owner can release its lease');
select is(public.release_drive_upload_chunk_lease(
  'a5555555-5555-4555-8555-555555555551', 'a5555555-5555-4555-8555-555555555561',
  'a5555555-5555-4555-8555-555555555591'
), false, 'releasing the same lease twice is harmless and reports no ownership');
select is((select acquired from public.acquire_drive_upload_chunk_lease(
  'a5555555-5555-4555-8555-555555555551', 'a5555555-5555-4555-8555-555555555561',
  'a5555555-5555-4555-8555-555555555592'
)), true, 'a later request can acquire after the prior owner releases');

update public.drive_upload_sessions
set chunk_lease_expires_at = pg_catalog.clock_timestamp() - interval '1 second'
where id = 'a5555555-5555-4555-8555-555555555561';
select is((select acquired from public.acquire_drive_upload_chunk_lease(
  'a5555555-5555-4555-8555-555555555551', 'a5555555-5555-4555-8555-555555555561',
  'a5555555-5555-4555-8555-555555555593'
)), true, 'a new fenced owner can recover an expired lease');
select is(public.release_drive_upload_chunk_lease(
  'a5555555-5555-4555-8555-555555555551', 'a5555555-5555-4555-8555-555555555561',
  'a5555555-5555-4555-8555-555555555592'
), false, 'the old owner cannot release a lease after fencing');
select is(public.release_drive_upload_chunk_lease(
  'a5555555-5555-4555-8555-555555555551', 'a5555555-5555-4555-8555-555555555561',
  'a5555555-5555-4555-8555-555555555593'
), true, 'the recovered lease owner can release');

update public.drive_upload_sessions
set expires_at = pg_catalog.clock_timestamp() - interval '1 second',
    chunk_lease_id = 'a5555555-5555-4555-8555-555555555594',
    chunk_lease_expires_at = pg_catalog.clock_timestamp() + interval '1 minute'
where id = 'a5555555-5555-4555-8555-555555555561';
select is((select pg_catalog.count(*) from public.claim_expired_drive_upload_cleanup(100)
  where upload_id = 'a5555555-5555-4555-8555-555555555561'), 0::bigint,
  'cleanup will not claim an expired reservation while a chunk lease is live');
update public.drive_upload_sessions
set chunk_lease_expires_at = pg_catalog.clock_timestamp() - interval '1 second'
where id = 'a5555555-5555-4555-8555-555555555561';
select is((select pg_catalog.count(*) from public.claim_expired_drive_upload_cleanup(100)
  where upload_id = 'a5555555-5555-4555-8555-555555555561'), 1::bigint,
  'cleanup can claim the reservation after the lease has expired');
select ok((select chunk_lease_id is null and chunk_lease_expires_at is null
  from public.drive_upload_sessions where id = 'a5555555-5555-4555-8555-555555555561'),
  'cleanup clears only the expired lease before provider reconciliation');
select is(public.release_drive_upload_chunk_lease(
  'a5555555-5555-4555-8555-555555555551', 'a5555555-5555-4555-8555-555555555561',
  'a5555555-5555-4555-8555-555555555594'
), false, 'a former chunk owner cannot change a cleanup-claimed reservation');
select throws_ok($$update public.drive_upload_sessions
  set chunk_lease_id = 'a5555555-5555-4555-8555-555555555595', chunk_lease_expires_at = null
  where id = 'a5555555-5555-4555-8555-555555555561'$$,
  '23514', null, 'database rejects a partial lease state');

select * from finish();
rollback;

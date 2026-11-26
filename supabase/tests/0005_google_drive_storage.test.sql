-- Proposal-only integration assertions. Run after migration 0004 in a dedicated
-- development database. All synthetic rows are rolled back at the end.
begin;
select plan(71);

select has_table('public', 'drive_connections', 'Drive connection table exists');
select has_table('public', 'drive_upload_sessions', 'Drive upload reservations exist');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.drive_connections'::regclass), 'Drive connections enforce RLS');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.drive_upload_sessions'::regclass), 'Drive upload sessions enforce RLS');
select ok(not has_table_privilege('anon', 'public.drive_connections', 'SELECT'), 'anon cannot read Drive credentials');
select ok(not has_table_privilege('authenticated', 'public.drive_connections', 'SELECT'), 'authenticated cannot read Drive credentials');
select ok(not has_table_privilege('anon', 'public.drive_upload_sessions', 'SELECT'), 'anon cannot read Drive reservations');
select ok(not has_table_privilege('authenticated', 'public.drive_upload_sessions', 'SELECT'), 'authenticated cannot read Drive reservations');
select ok((select prosecdef from pg_catalog.pg_proc where oid = 'public.reserve_drive_game_upload(uuid,uuid,text,text,text,bigint)'::regprocedure), 'reservation RPC is SECURITY DEFINER');
select ok((select prosecdef from pg_catalog.pg_proc where oid = 'public.complete_drive_game_upload(uuid,uuid,text,bigint,text)'::regprocedure), 'completion RPC is SECURITY DEFINER');
select is((select pg_catalog.replace(proconfig[1], '"', '') from pg_catalog.pg_proc where oid = 'public.reserve_drive_game_upload(uuid,uuid,text,text,text,bigint)'::regprocedure), 'search_path=', 'reservation RPC has an empty search_path');
select is((select pg_catalog.replace(proconfig[1], '"', '') from pg_catalog.pg_proc where oid = 'public.complete_drive_game_upload(uuid,uuid,text,bigint,text)'::regprocedure), 'search_path=', 'completion RPC has an empty search_path');
select is((select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc where oid = 'public.reserve_drive_game_upload(uuid,uuid,text,text,text,bigint)'::regprocedure), 'postgres', 'reservation RPC owner is postgres');
select is((select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc where oid = 'public.complete_drive_game_upload(uuid,uuid,text,bigint,text)'::regprocedure), 'postgres', 'completion RPC owner is postgres');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid = 'public.assert_game_storage_quota(uuid,bigint)'::regprocedure), 'shared quota checker is SECURITY DEFINER with an empty search_path');
select ok(position('assert_game_storage_quota' in pg_catalog.pg_get_functiondef('public.reserve_game_upload(uuid,text,text,text,bigint,uuid)'::regprocedure)) > 0 and position('assert_game_storage_quota' in pg_catalog.pg_get_functiondef('public.reserve_drive_game_upload(uuid,uuid,text,text,text,bigint)'::regprocedure)) > 0, 'both storage providers call the shared quota checker');
select ok(position('pg_advisory_xact_lock(740031, 1)' in pg_catalog.pg_get_functiondef('public.assert_game_storage_quota(uuid,bigint)'::regprocedure)) > 0, 'shared quota checker declares the transaction advisory lock used by both providers');
select ok((
  select pg_catalog.count(*) = 5
    and pg_catalog.bool_and(prosecdef and proconfig @> array['search_path=""'] and owner_role.rolname = 'postgres')
  from pg_catalog.pg_proc as function_row
  join pg_catalog.pg_roles as owner_role on owner_role.oid = function_row.proowner
  where function_row.oid in (
    'public.claim_expired_drive_upload_cleanup(integer)'::regprocedure,
    'public.complete_reconciled_drive_game_upload(uuid,uuid,uuid,text,bigint,text)'::regprocedure,
    'public.resolve_drive_upload_cleanup(uuid,uuid,uuid,text)'::regprocedure,
    'public.defer_drive_upload_cleanup(uuid,uuid,uuid,text,integer,boolean)'::regprocedure,
    'public.release_drive_upload_manual_review(uuid,uuid)'::regprocedure
  )
), 'all cleanup RPCs are postgres-owned SECURITY DEFINER functions with empty search_path');
select ok((
  has_function_privilege('service_role', 'public.claim_expired_drive_upload_cleanup(integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.resolve_drive_upload_cleanup(uuid,uuid,uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.complete_reconciled_drive_game_upload(uuid,uuid,uuid,text,bigint,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.defer_drive_upload_cleanup(uuid,uuid,uuid,text,integer,boolean)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.release_drive_upload_manual_review(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_expired_drive_upload_cleanup(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.resolve_drive_upload_cleanup(uuid,uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.defer_drive_upload_cleanup(uuid,uuid,uuid,text,integer,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.release_drive_upload_manual_review(uuid,uuid)', 'EXECUTE')
), 'only the trusted server role can claim or resolve Drive cleanup');
select ok((
  exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.drive_upload_sessions'::regclass and attname = 'cleanup_claim_id' and not attisdropped)
  and exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.drive_upload_sessions'::regclass and attname = 'cleanup_manual_review_at' and not attisdropped)
), 'Drive cleanup stores an expiring worker claim and manual-review state');
select ok(exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.drive_upload_sessions'::regclass and attname = 'object_cleanup_completed_at' and not attisdropped), 'Drive reservations retain a cleanup confirmation marker');
select ok(has_function_privilege('service_role', 'public.reserve_drive_game_upload(uuid,uuid,text,text,text,bigint)', 'EXECUTE'), 'service_role can reserve uploads');
select ok(has_function_privilege('service_role', 'public.complete_drive_game_upload(uuid,uuid,text,bigint,text)', 'EXECUTE'), 'service_role can complete uploads');
select ok(not has_function_privilege('authenticated', 'public.reserve_drive_game_upload(uuid,uuid,text,text,text,bigint)', 'EXECUTE'), 'authenticated cannot reserve by RPC');
select ok(not has_function_privilege('authenticated', 'public.complete_drive_game_upload(uuid,uuid,text,bigint,text)', 'EXECUTE'), 'authenticated cannot complete by RPC');
select ok((select is_nullable = 'YES' from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'sha256'), 'provider checksum model permits Drive SHA-256 to remain unset');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.games'::regclass) and exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'games' and policyname = 'Users can read own games'), 'existing games RLS and owner policy remain enabled');

insert into auth.users (id, email, invited_at, raw_user_meta_data) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'drive-a@example.invalid', pg_catalog.now(), '{}'::jsonb),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'drive-b@example.invalid', pg_catalog.now(), '{}'::jsonb),
  ('99999999-9999-4999-8999-999999999999', 'drive-c@example.invalid', null, '{"invited_at":"2099-01-01"}'::jsonb),
  ('14141414-1414-4141-8141-141414141414', 'drive-cleanup@example.invalid', pg_catalog.now(), '{}'::jsonb),
  ('16161616-1616-4161-8161-161616161616', 'drive-reconcile@example.invalid', pg_catalog.now(), '{}'::jsonb);
insert into auth.users (id, email, invited_at, raw_user_meta_data) values
  ('12121212-1212-4121-8121-121212121212', 'drive-d@example.invalid', pg_catalog.now(), '{}'::jsonb),
  ('13131313-1313-4131-8131-131313131313', 'drive-e@example.invalid', pg_catalog.now(), '{}'::jsonb);
insert into auth.users (id, email, invited_at, raw_user_meta_data)
select ('70000000-0000-4000-8000-' || pg_catalog.lpad(n::text, 12, '0'))::uuid,
       'global-quota-' || n::text || '@example.invalid', pg_catalog.now(), '{}'::jsonb
from pg_catalog.generate_series(1, 7) as n;
insert into public.drive_connections (user_id, drive_permission_id, refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag, token_key_version, granted_scope, connected_at)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'drive-owner-a', 'cipher', 'nonce', 'tag', 1, 'https://www.googleapis.com/auth/drive.file', pg_catalog.now()),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'drive-owner-b', 'cipher', 'nonce', 'tag', 1, 'https://www.googleapis.com/auth/drive.file', pg_catalog.now()),
  ('12121212-1212-4121-8121-121212121212', 'drive-owner-d', 'cipher', 'nonce', 'tag', 1, 'https://www.googleapis.com/auth/drive.file', pg_catalog.now()),
  ('13131313-1313-4131-8131-131313131313', 'drive-owner-e', 'cipher', 'nonce', 'tag', 1, 'https://www.googleapis.com/auth/drive.file', pg_catalog.now()),
  ('14141414-1414-4141-8141-141414141414', 'drive-cleanup-owner', 'cipher', 'nonce', 'tag', 1, 'https://www.googleapis.com/auth/drive.file', pg_catalog.now()),
  ('16161616-1616-4161-8161-161616161616', 'drive-reconcile-owner', 'cipher', 'nonce', 'tag', 1, 'https://www.googleapis.com/auth/drive.file', pg_catalog.now());

create temporary table drive_test_upload_a on commit drop as
select * from public.reserve_drive_game_upload(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'a.gb', 'A', 'gb', 600000000
);
select is((select reserved_status from drive_test_upload_a), 'pending', 'invited owner A can reserve a Drive upload');
select is((select reserved_upload_id from public.reserve_drive_game_upload(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'a.gb', 'A', 'gb', 600000000
)), (select reserved_upload_id from drive_test_upload_a), 'same idempotency key returns the original reservation');
select throws_ok($$select * from public.reserve_drive_game_upload('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'b.gb', 'B', 'gb', 300000001)$$, '23514', null, 'atomic quota reservation rejects an upload above the remaining owner quota');
select throws_ok($$select * from public.reserve_game_upload('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'cross-r2.gb', 'Cross provider', 'gb', 300000001, 'abababab-abab-4bab-8bab-abababababab')$$, '23514', 'User storage quota exceeded', 'a Drive reservation is included before accepting R2 quota');
create temporary table drive_test_upload_b on commit drop as
select * from public.reserve_drive_game_upload(
  'ffffffff-ffff-4fff-8fff-ffffffffffff', '33333333-3333-4333-8333-333333333333', 'b.gb', 'B', 'gb', 900000000
);
select is((select reserved_status from drive_test_upload_b), 'pending', 'owner B receives an independent per-user quota');
select throws_ok($$select * from public.reserve_drive_game_upload('99999999-9999-4999-8999-999999999999', '44444444-4444-4444-8444-444444444444', 'c.gb', 'C', 'gb', 1)$$, '42501', null, 'an uninvited account cannot reserve Drive storage');
select throws_ok($$select * from public.complete_drive_game_upload('ffffffff-ffff-4fff-8fff-ffffffffffff', (select reserved_upload_id from drive_test_upload_a), 'foreign-file', 600000000, '0123456789abcdef0123456789abcdef')$$, '42501', null, 'a different user cannot complete another owner reservation');
select is((select completed_game_id from public.complete_drive_game_upload(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  (select reserved_upload_id from drive_test_upload_a),
  'drive-file-a', 600000000, '0123456789abcdef0123456789abcdef'
)), (select reserved_game_id from drive_test_upload_a), 'owner A completion creates the reserved game');
select ok((select sha256 is null and provider_checksum = '0123456789abcdef0123456789abcdef' from public.games where id = (select reserved_game_id from drive_test_upload_a)), 'Drive metadata uses provider checksum instead of trusting browser SHA-256');
select is((select completed_game_id from public.complete_drive_game_upload(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  (select reserved_upload_id from drive_test_upload_a),
  'drive-file-a', 600000000, '0123456789abcdef0123456789abcdef'
)), (select reserved_game_id from drive_test_upload_a), 'identical completed Drive retry returns the same game');
select throws_ok($$select * from public.complete_drive_game_upload('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', (select reserved_upload_id from drive_test_upload_a), 'different-file', 600000000, '0123456789abcdef0123456789abcdef')$$,
  '22023', 'Completed Drive upload metadata does not match the stored game', 'completed Drive retry rejects a different provider file ID');
select throws_ok($$select * from public.complete_drive_game_upload('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', (select reserved_upload_id from drive_test_upload_a), 'drive-file-a', 599999999, '0123456789abcdef0123456789abcdef')$$,
  '22023', 'Completed Drive upload metadata does not match the stored game', 'completed Drive retry rejects a different verified size');
select throws_ok($$select * from public.complete_drive_game_upload('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', (select reserved_upload_id from drive_test_upload_a), 'drive-file-a', 600000000, '1123456789abcdef0123456789abcdef')$$,
  '22023', 'Completed Drive upload metadata does not match the stored game', 'completed Drive retry rejects a different provider MD5 checksum');
select throws_ok($$insert into public.games (id, user_id, title, console, file_name, object_key, size_bytes, sha256, storage_provider, provider_file_id, provider_account_id, provider_checksum) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Missing checksum', 'gb', 'missing.gb', 'google-drive/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/missing', 1, null, 'google_drive', 'missing-file', 'drive-owner-a', null)$$, '23514', null, 'Drive game rows reject a missing provider checksum');
select throws_ok($$select * from public.complete_drive_game_upload('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', (select reserved_upload_id from drive_test_upload_a), 'drive-file-a', 600000000, 'not-a-checksum')$$, '22023', null, 'malformed provider checksum is rejected');

-- R2 first, then Drive; an expired R2 object remains charged until cleanup.
create temporary table r2_first_fixture on commit drop as
select * from public.reserve_game_upload(
  '12121212-1212-4121-8121-121212121212', 'r2-first.gb', 'R2 first', 'gb', 600000000,
  'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd'
);
select throws_ok($$select * from public.reserve_drive_game_upload('12121212-1212-4121-8121-121212121212', 'dededede-dede-4ede-8ede-dededededede', 'drive-next.gb', 'Drive next', 'gb', 300000001)$$, '23514', 'User storage quota exceeded', 'R2 reservation is included before accepting Drive quota');
update public.upload_sessions set expires_at = pg_catalog.now() - interval '1 second'
where id = (select reserved_upload_id from r2_first_fixture);
select is(public.expire_game_upload('12121212-1212-4121-8121-121212121212', (select reserved_upload_id from r2_first_fixture)), true, 'R2-first reservation expires');
select throws_ok($$select * from public.reserve_drive_game_upload('12121212-1212-4121-8121-121212121212', 'dededede-dede-4ede-8ede-dededededede', 'drive-next.gb', 'Drive next', 'gb', 300000001)$$, '23514', 'User storage quota exceeded', 'expired R2 hold remains charged while provider cleanup is unconfirmed');
update public.upload_sessions set object_cleanup_completed_at = pg_catalog.now()
where id = (select reserved_upload_id from r2_first_fixture);
create temporary table drive_after_cleanup_fixture on commit drop as
select * from public.reserve_drive_game_upload(
  '12121212-1212-4121-8121-121212121212', 'dededede-dede-4ede-8ede-dededededede', 'drive-next.gb', 'Drive next', 'gb', 600000000
);
select is((select reserved_status from drive_after_cleanup_fixture), 'pending', 'confirmed R2 object cleanup releases the shared quota hold');

-- Drive-first expiry follows the same conservative cleanup rule.
create temporary table drive_expiring_fixture on commit drop as
select * from public.reserve_drive_game_upload(
  '13131313-1313-4131-8131-131313131313', 'efefefef-efef-4fef-8fef-efefefefefef', 'drive-expiring.gb', 'Drive expiring', 'gb', 900000000
);
update public.drive_upload_sessions set status = 'expired', expires_at = pg_catalog.now() - interval '1 second'
where id = (select reserved_upload_id from drive_expiring_fixture);
select throws_ok($$select * from public.reserve_game_upload('13131313-1313-4131-8131-131313131313', 'r2-blocked.gb', 'R2 blocked', 'gb', 1, 'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1')$$, '23514', 'User storage quota exceeded', 'expired Drive hold remains charged until cleanup confirmation');
update public.drive_upload_sessions set object_cleanup_completed_at = pg_catalog.now()
where id = (select reserved_upload_id from drive_expiring_fixture);
select is((select count(*)::integer from public.reserve_game_upload(
  '13131313-1313-4131-8131-131313131313', 'r2-after-cleanup.gb', 'R2 after cleanup', 'gb', 900000000,
  'f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2'
)), 1, 'confirmed Drive object cleanup releases the shared quota hold');

-- Expired Drive reservations can release quota only under a live worker claim
-- after the server has verified the owner's Drive state.
create temporary table drive_cleanup_fixture on commit drop as
select * from public.reserve_drive_game_upload(
  '14141414-1414-4141-8141-141414141414', '18181818-1818-4181-8181-181818181818', 'cleanup.gb', 'Cleanup', 'gb', 900000000
);
update public.drive_upload_sessions
set status = 'expired', expires_at = pg_catalog.now() - interval '8 days'
where id = (select reserved_upload_id from drive_cleanup_fixture);
create temporary table drive_cleanup_claim_a on commit drop as
select * from public.claim_expired_drive_upload_cleanup(10);
select is((select count(*)::integer from drive_cleanup_claim_a where upload_id = (select reserved_upload_id from drive_cleanup_fixture)), 1, 'worker claims an expired Drive reservation');
select ok((select status = 'expired' and cleanup_attempts = 1 and cleanup_claim_id is not null
  from public.drive_upload_sessions where id = (select reserved_upload_id from drive_cleanup_fixture)), 'claim marks the reservation expired and issues an attempt counter and claim token');
select throws_ok($$select public.resolve_drive_upload_cleanup('14141414-1414-4141-8141-141414141414', (select reserved_upload_id from drive_cleanup_fixture), (select cleanup_claim_id from drive_cleanup_claim_a where upload_id = (select reserved_upload_id from drive_cleanup_fixture)), 'file_found')$$,
  '22023', 'Invalid Drive cleanup resolution', 'a discovered file cannot be mislabeled as absent or deleted');
select throws_ok($$select public.resolve_drive_upload_cleanup('14141414-1414-4141-8141-141414141414', (select reserved_upload_id from drive_cleanup_fixture), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'confirmed_absent')$$,
  '55000', 'Drive cleanup claim is unavailable', 'cleanup requires the current worker claim');
select is(public.defer_drive_upload_cleanup(
  '14141414-1414-4141-8141-141414141414',
  (select reserved_upload_id from drive_cleanup_fixture),
  (select cleanup_claim_id from drive_cleanup_claim_a where upload_id = (select reserved_upload_id from drive_cleanup_fixture)),
  'authorization_revoked', 86400, true
), true, 'revoked Drive authorization is parked for manual review');
select ok((select object_cleanup_completed_at is null and cleanup_manual_review_at is not null
  from public.drive_upload_sessions where id = (select reserved_upload_id from drive_cleanup_fixture)), 'manual review retains the quota hold');
select is((select count(*)::integer from public.claim_expired_drive_upload_cleanup(10)
  where upload_id = (select reserved_upload_id from drive_cleanup_fixture)), 0, 'manual-review reservations are not automatically reclaimed');
select is(public.release_drive_upload_manual_review(
  '14141414-1414-4141-8141-141414141414', (select reserved_upload_id from drive_cleanup_fixture)
), true, 'authorized manual recovery can safely requeue a reservation');
create temporary table drive_cleanup_claim_b on commit drop as
select * from public.claim_expired_drive_upload_cleanup(10);
select is((select count(*)::integer from drive_cleanup_claim_b where upload_id = (select reserved_upload_id from drive_cleanup_fixture)), 1, 'requeued reservation receives a fresh cleanup claim');
select is(public.resolve_drive_upload_cleanup(
  '14141414-1414-4141-8141-141414141414',
  (select reserved_upload_id from drive_cleanup_fixture),
  (select cleanup_claim_id from drive_cleanup_claim_b where upload_id = (select reserved_upload_id from drive_cleanup_fixture)),
  'confirmed_absent'
), true, 'confirmed absence releases the Drive reservation');
select is(public.resolve_drive_upload_cleanup(
  '14141414-1414-4141-8141-141414141414',
  (select reserved_upload_id from drive_cleanup_fixture),
  (select cleanup_claim_id from drive_cleanup_claim_b where upload_id = (select reserved_upload_id from drive_cleanup_fixture)),
  'confirmed_absent'
), true, 'repeated cleanup confirmation is idempotent');
select ok((select object_cleanup_completed_at is not null and cleanup_last_result = 'confirmed_absent'
  from public.drive_upload_sessions where id = (select reserved_upload_id from drive_cleanup_fixture)), 'confirmed cleanup is recorded and releases quota only after provider verification');
select is((select count(*)::integer from public.reserve_game_upload(
  '14141414-1414-4141-8141-141414141414', 'after-drive-cleanup.gb', 'After cleanup', 'gb', 1,
  '15151515-1515-4151-8151-151515151515'
)), 1, 'confirmed Drive cleanup releases the per-user hold for the other provider');
select is((select cleanup_attempts from public.drive_upload_sessions where id = (select reserved_upload_id from drive_cleanup_fixture)), 2, 'each automatic retry increments the reconciliation attempt count');

create temporary table drive_reconcile_fixture on commit drop as
select * from public.reserve_drive_game_upload(
  '16161616-1616-4161-8161-161616161616', '17171717-1717-4171-8171-171717171717', 'reconcile.gb', 'Reconcile', 'gb', 1
);
update public.drive_upload_sessions
set status = 'expired', expires_at = pg_catalog.now() - interval '8 days'
where id = (select reserved_upload_id from drive_reconcile_fixture);
create temporary table drive_reconcile_claim on commit drop as
select * from public.claim_expired_drive_upload_cleanup(10);
select is((select completed_game_id from public.complete_reconciled_drive_game_upload(
  '16161616-1616-4161-8161-161616161616',
  (select reserved_upload_id from drive_reconcile_fixture),
  (select cleanup_claim_id from drive_reconcile_claim where upload_id = (select reserved_upload_id from drive_reconcile_fixture)),
  'recovered-drive-file', 1, '0123456789abcdef0123456789abcdef'
)), (select reserved_game_id from drive_reconcile_fixture), 'claim holder can complete a provider-verified expired upload');
select is((select completed_game_id from public.complete_reconciled_drive_game_upload(
  '16161616-1616-4161-8161-161616161616',
  (select reserved_upload_id from drive_reconcile_fixture),
  (select cleanup_claim_id from drive_reconcile_claim where upload_id = (select reserved_upload_id from drive_reconcile_fixture)),
  'recovered-drive-file', 1, '0123456789abcdef0123456789abcdef'
)), (select reserved_game_id from drive_reconcile_fixture), 'lost reconciliation response can be retried idempotently');
select throws_ok($$select * from public.complete_reconciled_drive_game_upload(
  '16161616-1616-4161-8161-161616161616',
  (select reserved_upload_id from drive_reconcile_fixture),
  (select cleanup_claim_id from drive_reconcile_claim where upload_id = (select reserved_upload_id from drive_reconcile_fixture)),
  'altered-file', 1, '0123456789abcdef0123456789abcdef'
)$$, '22023', 'Completed Drive upload metadata does not match the stored game', 'reconciled completion retry rejects altered provider metadata');
select ok((select status = 'completed' and object_cleanup_completed_at is null and cleanup_claim_id is null
  from public.drive_upload_sessions where id = (select reserved_upload_id from drive_reconcile_fixture)), 'verified recovered upload completes instead of releasing its quota');

-- Fill the 9 GB shared reserve across committed games and both providers.
do $$
declare
  quota_index integer;
  quota_user_id uuid;
begin
  for quota_index in 1..6 loop
    quota_user_id := ('70000000-0000-4000-8000-' || pg_catalog.lpad(quota_index::text, 12, '0'))::uuid;
    perform * from public.reserve_game_upload(
      quota_user_id, 'global-' || quota_index::text || '.gb', 'Global quota', 'gb', 900000000,
      ('80000000-0000-4000-8000-' || pg_catalog.lpad(quota_index::text, 12, '0'))::uuid
    );
  end loop;
  quota_user_id := '70000000-0000-4000-8000-000000000007'::uuid;
  perform * from public.reserve_game_upload(
    quota_user_id, 'global-7.gb', 'Global quota', 'gb', 599999998,
    '80000000-0000-4000-8000-000000000007'
  );
end;
$$;
select throws_ok($$select * from public.reserve_drive_game_upload('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f3f3', 'global-over.gb', 'Global over', 'gb', 1)$$, '23514', 'Shared storage reserve exceeded', 'all users and providers share the global storage reserve');

set local role authenticated;
set local request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
select is((select count(*)::integer from public.games), 1, 'owner A sees only the Drive game in their library');
select throws_ok($$select * from public.drive_connections$$, '42501', null, 'authenticated users cannot read encrypted Drive connection rows');
set local request.jwt.claim.sub = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
select is((select count(*)::integer from public.games), 0, 'owner B cannot read owner A Drive game');
reset role;

delete from public.games where id = (select reserved_game_id from drive_test_upload_a);
select throws_ok($$select * from public.complete_drive_game_upload('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', (select reserved_upload_id from drive_test_upload_a), 'drive-file-a', 600000000, '0123456789abcdef0123456789abcdef')$$,
  'P0002', 'Completed Drive upload has no associated game record', 'completed Drive retry fails explicitly when its game row is missing');

select * from finish();
rollback;

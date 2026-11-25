-- Proposal-only integration assertions. Run after migration 0004 in a dedicated
-- development database. No fixtures are inserted or changed by this suite.
begin;
select plan(32);

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
select ok(has_function_privilege('service_role', 'public.reserve_drive_game_upload(uuid,uuid,text,text,text,bigint)', 'EXECUTE'), 'service_role can reserve uploads');
select ok(has_function_privilege('service_role', 'public.complete_drive_game_upload(uuid,uuid,text,bigint,text)', 'EXECUTE'), 'service_role can complete uploads');
select ok(not has_function_privilege('authenticated', 'public.reserve_drive_game_upload(uuid,uuid,text,text,text,bigint)', 'EXECUTE'), 'authenticated cannot reserve by RPC');
select ok(not has_function_privilege('authenticated', 'public.complete_drive_game_upload(uuid,uuid,text,bigint,text)', 'EXECUTE'), 'authenticated cannot complete by RPC');
select ok((select is_nullable = 'YES' from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'sha256'), 'provider checksum model permits Drive SHA-256 to remain unset');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.games'::regclass) and exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'games' and policyname = 'Users can read own games'), 'existing games RLS and owner policy remain enabled');

insert into auth.users (id, email, invited_at, raw_user_meta_data) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'drive-a@example.invalid', pg_catalog.now(), '{}'::jsonb),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'drive-b@example.invalid', pg_catalog.now(), '{}'::jsonb),
  ('99999999-9999-4999-8999-999999999999', 'drive-c@example.invalid', null, '{"invited_at":"2099-01-01"}'::jsonb);
insert into public.drive_connections (user_id, drive_permission_id, refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag, token_key_version, granted_scope, connected_at)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'drive-owner-a', 'cipher', 'nonce', 'tag', 1, 'https://www.googleapis.com/auth/drive.file', pg_catalog.now()),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'drive-owner-b', 'cipher', 'nonce', 'tag', 1, 'https://www.googleapis.com/auth/drive.file', pg_catalog.now());

create temporary table drive_test_upload_a on commit drop as
select * from public.reserve_drive_game_upload(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'a.gb', 'A', 'gb', 600000000
);
select is((select reserved_status from drive_test_upload_a), 'pending', 'invited owner A can reserve a Drive upload');
select is((select reserved_upload_id from public.reserve_drive_game_upload(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'a.gb', 'A', 'gb', 600000000
)), (select reserved_upload_id from drive_test_upload_a), 'same idempotency key returns the original reservation');
select throws_ok($$select * from public.reserve_drive_game_upload('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'b.gb', 'B', 'gb', 300000001)$$, '23514', null, 'atomic quota reservation rejects an upload above the remaining owner quota');
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
select throws_ok($$select * from public.complete_drive_game_upload('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', (select reserved_upload_id from drive_test_upload_a), 'drive-file-a', 600000000, 'not-a-checksum')$$, '22023', null, 'malformed provider checksum is rejected');

set local role authenticated;
set local request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
select is((select count(*)::integer from public.games), 1, 'owner A sees only the Drive game in their library');
select throws_ok($$select * from public.drive_connections$$, '42501', null, 'authenticated users cannot read encrypted Drive connection rows');
set local request.jwt.claim.sub = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
select is((select count(*)::integer from public.games), 0, 'owner B cannot read owner A Drive game');
reset role;

select * from finish();
rollback;

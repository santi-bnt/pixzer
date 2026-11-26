begin;

create extension if not exists pgtap with schema extensions;
select plan(37);

select ok((select prosecdef from pg_catalog.pg_proc where oid = 'public.assert_game_storage_quota(uuid,bigint)'::regprocedure), 'shared quota checker is SECURITY DEFINER');
select is((select pg_catalog.replace(proconfig[1], '"', '') from pg_catalog.pg_proc where oid = 'public.assert_game_storage_quota(uuid,bigint)'::regprocedure), 'search_path=', 'shared quota checker has an empty search_path');
select is((select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc where oid = 'public.assert_game_storage_quota(uuid,bigint)'::regprocedure), 'postgres', 'shared quota checker owner is postgres');
select ok(has_function_privilege('service_role', 'public.assert_game_storage_quota(uuid,bigint)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.assert_game_storage_quota(uuid,bigint)', 'EXECUTE'), 'only the trusted server role can invoke the quota checker');

select ok(
  exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.upload_sessions'::regclass
      and attname = 'object_cleanup_completed_at'
      and not attisdropped
  ),
  'expired-object cleanup has a retry-safe completion marker'
);

select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.profiles'::regclass), 'profiles RLS stays enabled');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.games'::regclass), 'games RLS stays enabled');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.upload_sessions'::regclass), 'upload_sessions RLS stays enabled');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.saves'::regclass), 'saves RLS stays enabled');
select is((select count(*)::integer from pg_catalog.pg_policies where schemaname = 'public' and tablename in ('profiles', 'games', 'upload_sessions', 'saves')), 6, 'the six original table policies remain present');

select ok((
  select pg_catalog.count(*) = 3 and pg_catalog.bool_and(prosecdef)
  from pg_catalog.pg_proc
  where oid in (
    'public.reserve_game_upload(uuid,text,text,text,bigint,uuid)'::regprocedure,
    'public.expire_game_upload(uuid,uuid)'::regprocedure,
    'public.complete_game_upload(uuid,uuid,bigint,text)'::regprocedure
  )
), 'all upload RPCs are SECURITY DEFINER');
select ok((
  select pg_catalog.count(*) = 3 and pg_catalog.bool_and(proconfig @> array['search_path=""'])
  from pg_catalog.pg_proc
  where oid in (
    'public.reserve_game_upload(uuid,text,text,text,bigint,uuid)'::regprocedure,
    'public.expire_game_upload(uuid,uuid)'::regprocedure,
    'public.complete_game_upload(uuid,uuid,bigint,text)'::regprocedure
  )
), 'all upload RPCs pin an empty search_path');
select ok((
  select pg_catalog.count(*) = 3 and pg_catalog.bool_and(owner_role.rolname = 'postgres')
  from pg_catalog.pg_proc as function_row
  join pg_catalog.pg_roles as owner_role on owner_role.oid = function_row.proowner
  where function_row.oid in (
    'public.reserve_game_upload(uuid,text,text,text,bigint,uuid)'::regprocedure,
    'public.expire_game_upload(uuid,uuid)'::regprocedure,
    'public.complete_game_upload(uuid,uuid,bigint,text)'::regprocedure
  )
), 'the trusted postgres role owns the SECURITY DEFINER RPCs');
select ok((
  not has_function_privilege('anon', 'public.reserve_game_upload(uuid,text,text,text,bigint,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.expire_game_upload(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.complete_game_upload(uuid,uuid,bigint,text)', 'EXECUTE')
), 'anonymous role cannot call privileged upload RPCs');
select ok((
  not has_function_privilege('authenticated', 'public.reserve_game_upload(uuid,text,text,text,bigint,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.expire_game_upload(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.complete_game_upload(uuid,uuid,bigint,text)', 'EXECUTE')
), 'authenticated role cannot call privileged upload RPCs');
select ok((
  has_function_privilege('service_role', 'public.reserve_game_upload(uuid,text,text,text,bigint,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.expire_game_upload(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.complete_game_upload(uuid,uuid,bigint,text)', 'EXECUTE')
), 'server service role can call the upload RPCs');

insert into auth.users (id, email, invited_at, raw_user_meta_data)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'storage-test@example.invalid', now(), '{}'::jsonb);

insert into auth.users (id, email, invited_at, raw_user_meta_data)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'storage-other@example.invalid', now(), '{}'::jsonb);

insert into auth.users (id, email, invited_at, raw_user_meta_data)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'storage-uninvited@example.invalid', null, '{"invited_at":"2099-01-01"}'::jsonb);

select throws_ok(
  $$select * from public.reserve_game_upload('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'denied.gb', 'Denied', 'gb', 1, '33333333-3333-4333-8333-333333333333')$$,
  '42501', 'Invited account required', 'client metadata cannot authorize an uninvited R2 reservation'
);

create temporary table upload_fixture on commit drop as
select *
from public.reserve_game_upload(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'test.gb', 'Storage test', 'gb', 100,
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
);

select is((select count(*)::integer from public.upload_sessions where user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 1, 'reservation creates exactly one pending upload');
select like((select staging_object_key from upload_fixture), 'users/dddddddd-dddd-4ddd-8ddd-dddddddddddd/games/%/rom/original', 'reserved key is scoped below the authenticated owner prefix');

select is((
  select reserved_upload_id
  from public.reserve_game_upload(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'test.gb', 'Storage test', 'gb', 100,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  )
), (select reserved_upload_id from upload_fixture), 'repeated idempotency key returns the same upload');
select is((select count(*)::integer from public.upload_sessions where user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 1, 'idempotent reservation does not consume quota twice');

select throws_ok(
  $$select * from public.reserve_game_upload('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'too-large.gb', 'Too large', 'gb', 899999999, 'ffffffff-ffff-4fff-8fff-ffffffffffff')$$,
  '23514', 'User storage quota exceeded', 'per-user aggregate quota rejects an over-limit reservation'
);
select throws_ok(
  $$select * from public.reserve_game_upload('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'wrong.nds', 'Wrong console', 'gb', 10, '11111111-1111-4111-8111-111111111111')$$,
  '22023', 'Unsupported console and file extension', 'console and file extension must agree'
);

select is((
  select completed_game_id
  from public.complete_game_upload(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    (select reserved_upload_id from upload_fixture),
    100,
    repeat('a', 64)
  )
), (select reserved_game_id from upload_fixture), 'verified completion creates the reserved game ID');
select is((select count(*)::integer from public.games where user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 1, 'completion inserts one private game row');
select is((select status from public.upload_sessions where id = (select reserved_upload_id from upload_fixture)), 'completed', 'completed reservation records its terminal state');

select is((
  select completed_game_id
  from public.complete_game_upload(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    (select reserved_upload_id from upload_fixture),
    100,
    repeat('a', 64)
  )
), (select reserved_game_id from upload_fixture), 'repeated completion returns the same game');

select throws_ok(
  $$select * from public.complete_game_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', (select reserved_upload_id from upload_fixture), 100, repeat('a', 64))$$,
  '42501', 'Upload session unavailable', 'a different user cannot complete this upload reservation'
);
select throws_ok(
  $$select * from public.complete_game_upload('dddddddd-dddd-4ddd-8ddd-dddddddddddd', (select reserved_upload_id from upload_fixture), 99, repeat('a', 64))$$,
  '22023', 'Completed upload metadata does not match the stored game', 'completed R2 retry rejects a changed verified size'
);
select throws_ok(
  $$select * from public.complete_game_upload('dddddddd-dddd-4ddd-8ddd-dddddddddddd', (select reserved_upload_id from upload_fixture), 100, repeat('b', 64))$$,
  '22023', 'Completed upload metadata does not match the stored game', 'completed R2 retry rejects a changed SHA-256 checksum'
);
select throws_ok(
  $$select * from public.complete_game_upload('dddddddd-dddd-4ddd-8ddd-dddddddddddd', (select reserved_upload_id from upload_fixture), 100, 'not-a-sha256')$$,
  '22023', 'Invalid verified upload metadata', 'completion rejects a malformed content hash'
);
delete from public.games where id = (select reserved_game_id from upload_fixture);
select throws_ok(
  $$select * from public.complete_game_upload('dddddddd-dddd-4ddd-8ddd-dddddddddddd', (select reserved_upload_id from upload_fixture), 100, repeat('a', 64))$$,
  'P0002', 'Completed upload has no associated game record', 'completed R2 retry fails explicitly when its game row is missing'
);

create temporary table expiring_upload_fixture on commit drop as
select *
from public.reserve_game_upload(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'expire.gb', 'Expiring test', 'gb', 100,
  '22222222-2222-4222-8222-222222222222'
);
update public.upload_sessions
set expires_at = now() - interval '1 second'
where id = (select reserved_upload_id from expiring_upload_fixture);
select is(
  public.expire_game_upload(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    (select reserved_upload_id from expiring_upload_fixture)
  ),
  true,
  'an expired reservation transitions to its terminal expired state'
);
select is(
  (select count(*)::integer from public.upload_sessions where id = (select reserved_upload_id from expiring_upload_fixture) and status in ('pending', 'uploaded')),
  0,
  'expired reservation is excluded from active upload status'
);

create temporary table full_quota_upload_fixture on commit drop as
select * from public.reserve_game_upload(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'full.gb', 'Full quota', 'gb', 900000000,
  '44444444-4444-4444-8444-444444444444'
);
update public.upload_sessions
set expires_at = now() - interval '1 second'
where id = (select reserved_upload_id from full_quota_upload_fixture);
select is(public.expire_game_upload(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  (select reserved_upload_id from full_quota_upload_fixture)
), true, 'full quota reservation can expire without deleting its object record');
select throws_ok(
  $$select * from public.reserve_game_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'blocked.gb', 'Blocked', 'gb', 1, '55555555-5555-4555-8555-555555555555')$$,
  '23514', 'User storage quota exceeded', 'expired R2 reservation keeps quota until cleanup is confirmed'
);
update public.upload_sessions
set object_cleanup_completed_at = now()
where id = (select reserved_upload_id from full_quota_upload_fixture);
select is((select count(*)::integer from public.reserve_game_upload(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'after-cleanup.gb', 'After cleanup', 'gb', 900000000,
  '66666666-6666-4666-8666-666666666666'
)), 1, 'confirmed object cleanup releases the expired R2 quota hold');

select * from finish();
rollback;

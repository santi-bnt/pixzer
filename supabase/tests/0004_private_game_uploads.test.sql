begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

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

select * from finish();
rollback;

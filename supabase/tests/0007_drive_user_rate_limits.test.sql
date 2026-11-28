begin;
select plan(23);

select has_table('public', 'drive_user_rate_limits', 'per-user Drive rate limits are stored in PostgreSQL');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.drive_user_rate_limits'::regclass),
  'rate-limit table has RLS enabled');
select ok(has_table_privilege('service_role', 'public.drive_user_rate_limits', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.drive_user_rate_limits', 'SELECT')
  and not has_table_privilege('anon', 'public.drive_user_rate_limits', 'INSERT'),
  'only the privileged server role can access rate-limit rows');
select has_function('public', 'consume_drive_user_rate_limit', array['uuid', 'text'],
  'rate-limit RPC exists');
select ok((select prosecdef and proconfig @> array['search_path=""']
    and pg_catalog.pg_get_userbyid(proowner) = 'postgres'
  from pg_catalog.pg_proc
  where oid = 'public.consume_drive_user_rate_limit(uuid,text)'::regprocedure),
  'rate-limit RPC is postgres-owned SECURITY DEFINER with empty search_path');
select ok(has_function_privilege('service_role', 'public.consume_drive_user_rate_limit(uuid,text)', 'EXECUTE'),
  'service_role can consume rate limits');
select ok(not has_function_privilege('authenticated', 'public.consume_drive_user_rate_limit(uuid,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.consume_drive_user_rate_limit(uuid,text)', 'EXECUTE'),
  'browser roles cannot consume or bypass rate limits');

insert into auth.users (id, email, invited_at, raw_user_meta_data) values
  ('a6666666-6666-4666-8666-666666666661', 'rate-owner@example.invalid', pg_catalog.now(), '{}'::jsonb),
  ('a6666666-6666-4666-8666-666666666662', 'rate-other@example.invalid', pg_catalog.now(), '{}'::jsonb),
  ('a6666666-6666-4666-8666-666666666663', 'rate-uninvited@example.invalid', null, '{"invited_at":"2099-01-01"}'::jsonb);

create temporary table drive_rate_probe (allowed boolean, retry_after_seconds integer) on commit drop;

select is((select allowed from public.consume_drive_user_rate_limit(
  'a6666666-6666-4666-8666-666666666661', 'upload_intent')), true,
  'an invited user starts within the upload-intent allowance');
select is((select remaining_requests from public.consume_drive_user_rate_limit(
  'a6666666-6666-4666-8666-666666666661', 'upload_intent')), 10,
  'upload-intent allowance is shared across calls');
do $$
declare i integer;
begin
  for i in 1..10 loop
    insert into pg_temp.drive_rate_probe
    select result.allowed, result.retry_after_seconds
    from public.consume_drive_user_rate_limit('a6666666-6666-4666-8666-666666666661', 'upload_intent') as result;
  end loop;
end;
$$;
select is((select count(*) from drive_rate_probe where allowed), 10::bigint,
  'requests through the configured allowance are admitted');
select is((select allowed from public.consume_drive_user_rate_limit(
  'a6666666-6666-4666-8666-666666666661', 'upload_intent')), false,
  'the next upload-intent request is rejected');
select ok((select retry_after_seconds between 1 and 3600
  from public.consume_drive_user_rate_limit(
    'a6666666-6666-4666-8666-666666666661', 'upload_intent')),
  'rejections provide a bounded retry delay');
select is((select allowed from public.consume_drive_user_rate_limit(
  'a6666666-6666-4666-8666-666666666662', 'upload_intent')), true,
  'one invited user cannot consume another user’s allowance');

update public.drive_user_rate_limits
set window_started_at = pg_catalog.clock_timestamp() - interval '2 hours'
where user_id = 'a6666666-6666-4666-8666-666666666661' and action = 'upload_intent';
select is((select allowed from public.consume_drive_user_rate_limit(
  'a6666666-6666-4666-8666-666666666661', 'upload_intent')), true,
  'an expired window resets atomically');
select is((select remaining_requests from public.consume_drive_user_rate_limit(
  'a6666666-6666-4666-8666-666666666661', 'upload_intent')), 10,
  'the reset window starts with the full allowance minus the current request');

select throws_ok($$select * from public.consume_drive_user_rate_limit(
  'a6666666-6666-4666-8666-666666666663', 'upload_intent')$$,
  '42501', null, 'uninvited accounts cannot obtain a rate-limit allowance');
select throws_ok($$select * from public.consume_drive_user_rate_limit(
  'a6666666-6666-4666-8666-666666666661', 'unknown_action')$$,
  '22023', null, 'unknown actions are rejected');
select throws_ok($$select * from public.consume_drive_user_rate_limit(null, 'upload_intent')$$,
  '22023', null, 'missing user identity is rejected');
select is((select allowed from public.consume_drive_user_rate_limit(
  'a6666666-6666-4666-8666-666666666661', 'upload_chunk')), true,
  'each endpoint action has an independent bucket');

update public.drive_user_rate_limits
set window_started_at = pg_catalog.clock_timestamp() - interval '2 hours'
where user_id = 'a6666666-6666-4666-8666-666666666661' and action = 'upload_chunk';
truncate drive_rate_probe;
do $$
declare i integer;
begin
  for i in 1..240 loop
    insert into pg_temp.drive_rate_probe
    select result.allowed, result.retry_after_seconds
    from public.consume_drive_user_rate_limit('a6666666-6666-4666-8666-666666666661', 'upload_chunk') as result;
  end loop;
end;
$$;
select is((select count(*) from drive_rate_probe where allowed), 240::bigint,
  'chunk allowance permits one 900 MB transfer plus limited retries');
select is((select allowed from public.consume_drive_user_rate_limit(
  'a6666666-6666-4666-8666-666666666661', 'upload_chunk')), false,
  'chunk abuse beyond the hourly allowance is rejected');

truncate drive_rate_probe;
do $$
declare i integer;
begin
  for i in 1..30 loop
    insert into pg_temp.drive_rate_probe
    select result.allowed, result.retry_after_seconds
    from public.consume_drive_user_rate_limit('a6666666-6666-4666-8666-666666666661', 'drive_download') as result;
  end loop;
end;
$$;
select is((select count(*) from drive_rate_probe where allowed), 30::bigint,
  'downloads have a separate bounded allowance');
select is((select allowed from public.consume_drive_user_rate_limit(
  'a6666666-6666-4666-8666-666666666661', 'drive_download')), false,
  'download abuse beyond the hourly allowance is rejected');

select * from finish();
rollback;

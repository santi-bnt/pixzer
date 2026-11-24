begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

-- The trigger trusts auth.users.invited_at, never client-editable metadata.
insert into auth.users (id, email, invited_at, raw_user_meta_data)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'profile-a@example.invalid', now(), '{}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'profile-b@example.invalid', now(), '{}'::jsonb),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'profile-c@example.invalid', null, '{"invited_at":"2099-01-01T00:00:00Z"}'::jsonb);

select is(
  (select count(*)::integer from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1,
  'trusted invitation provisions user A profile'
);
select is(
  (select count(*)::integer from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  1,
  'trusted invitation provisions user B profile'
);
select is(
  (select count(*)::integer from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  0,
  'user metadata cannot provision an uninvited profile'
);

set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select throws_ok(
  $$insert into public.profiles (id) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$,
  '42501',
  null,
  'authenticated user cannot create a profile directly'
);
select throws_ok(
  $$update auth.users set invited_at = now() where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  '42501',
  null,
  'authenticated user cannot set the trusted invitation marker'
);
select throws_ok(
  $$select public.provision_invited_pixzer_profile()$$,
  '42501',
  null,
  'authenticated user cannot execute the provisioning function'
);
reset role;

-- Simulate the trusted invitation marker being set on an existing Auth user.
update auth.users
set invited_at = now()
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select is(
  (select count(*)::integer from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  1,
  'trusted invitation update provisions the existing user profile'
);

-- Repeated invitation processing must not duplicate the profile row.
update auth.users
set invited_at = now()
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select is(
  (select count(*)::integer from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  1,
  'profile provisioning is idempotent'
);

-- Exercise the migration's backfill for a previously invited Auth row whose
-- profile is absent, then repeat it to prove the backfill is idempotent.
delete from public.profiles
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
insert into public.profiles (id)
select invited_user.id
from auth.users as invited_user
where invited_user.invited_at is not null
on conflict (id) do nothing;
select is(
  (select count(*)::integer from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  1,
  'backfill provisions an existing invited Auth user'
);

insert into public.profiles (id)
select invited_user.id
from auth.users as invited_user
where invited_user.invited_at is not null
on conflict (id) do nothing;
select is(
  (select count(*)::integer from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  1,
  'repeated backfill does not duplicate a profile'
);

select * from finish();
rollback;

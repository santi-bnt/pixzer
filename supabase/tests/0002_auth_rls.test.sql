begin;

create extension if not exists pgtap with schema extensions;
select plan(48);

-- Fixed synthetic identities; no hosted credentials or game assets are used.
insert into auth.users (id, email, invited_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'rls-a@example.invalid', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'rls-b@example.invalid', now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'rls-c@example.invalid', null);

insert into public.profiles (id, display_name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Owner A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Owner B'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Uninvited C');

insert into public.games
  (id, user_id, title, console, file_name, object_key, size_bytes, sha256)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A Game', 'gb', 'a.gb', 'test/a/game', 1024, repeat('a', 64)),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Game', 'gba', 'b.gba', 'test/b/game', 2048, repeat('b', 64)),
  ('77777777-7777-4777-8777-777777777777', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'C Game', 'gbc', 'c.gbc', 'test/c/game', 4096, repeat('e', 64));

insert into public.upload_sessions
  (id, user_id, object_key, file_name, title, console, expected_size_bytes, expires_at)
values
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test/a/upload', 'a.gb', 'A Upload', 'gb', 1024, now() + interval '1 hour'),
  ('44444444-4444-4444-8444-444444444444', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'test/b/upload', 'b.gba', 'B Upload', 'gba', 2048, now() + interval '1 hour'),
  ('88888888-8888-4888-8888-888888888888', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'test/c/upload', 'c.gbc', 'C Upload', 'gbc', 4096, now() + interval '1 hour');

insert into public.saves
  (id, user_id, game_id, save_kind, revision, object_key, size_bytes, sha256)
values
  ('55555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'battery', 1, 'test/a/save', 64, repeat('c', 64)),
  ('66666666-6666-4666-8666-666666666666', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'battery', 1, 'test/b/save', 64, repeat('d', 64)),
  ('99999999-9999-4999-8999-999999999999', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '77777777-7777-4777-8777-777777777777', 'battery', 1, 'test/c/save', 64, repeat('f', 64));

-- Anonymous requests must have neither table privileges nor policy access.
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');
select throws_ok($$select * from public.games$$, '42501', null, 'anon cannot read games');
select throws_ok($$select * from public.upload_sessions$$, '42501', null, 'anon cannot read upload sessions');
select throws_ok($$select * from public.saves$$, '42501', null, 'anon cannot read saves');
select throws_ok($$select public.is_invited_pixzer_user()$$, '42501', null, 'anon cannot call invitation predicate');
select throws_ok($$update public.profiles set display_name = 'Anonymous'$$, '42501', null, 'anon cannot update profiles');
select throws_ok($$update public.games set is_favorite = true$$, '42501', null, 'anon cannot update games');
select throws_ok($$insert into public.upload_sessions (user_id, object_key, file_name, title, console, expected_size_bytes, expires_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'anon/key', 'x.gb', 'X', 'gb', 1, now() + interval '1 hour')$$, '42501', null, 'anon cannot create upload sessions');
select throws_ok($$delete from public.saves$$, '42501', null, 'anon cannot delete saves');
reset role;

-- User A sees only A's rows. Profile display name and favorite are the only
-- browser mutations intentionally granted by the Phase 2 contract.
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is((select count(*)::integer from public.profiles), 1, 'A sees one profile');
select is((select count(*)::integer from public.games), 1, 'A sees one game');
select is((select count(*)::integer from public.upload_sessions), 1, 'A sees one upload session');
select is((select count(*)::integer from public.saves), 1, 'A sees one save');
select results_eq($$update public.profiles set display_name = 'Owner A updated' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning display_name$$, $$select 'Owner A updated'::text$$, 'A updates own display name');
select results_eq($$update public.games set is_favorite = true where id = '11111111-1111-4111-8111-111111111111' returning is_favorite$$, $$select true$$, 'A updates own favorite');
select is_empty($$update public.profiles set display_name = 'Intrusion' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning id$$, 'A cannot update B profile');
select is_empty($$update public.games set is_favorite = true where id = '22222222-2222-4222-8222-222222222222' returning id$$, 'A cannot update B game');
select throws_ok($$update public.games set title = 'Changed' where id = '11111111-1111-4111-8111-111111111111'$$, '42501', null, 'A cannot update game metadata');
select throws_ok($$insert into public.games (user_id, title, console, file_name, object_key, size_bytes, sha256) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Injected', 'gb', 'i.gb', 'injected/key', 1, repeat('e', 64))$$, '42501', null, 'A cannot create game rows');
select throws_ok($$delete from public.games where id = '11111111-1111-4111-8111-111111111111'$$, '42501', null, 'A cannot delete game rows');
select throws_ok($$update public.profiles set id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '42501', null, 'A cannot change profile identity');
select throws_ok($$insert into public.upload_sessions (user_id, object_key, file_name, title, console, expected_size_bytes, expires_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a/new', 'x.gb', 'X', 'gb', 1, now() + interval '1 hour')$$, '42501', null, 'A cannot create upload sessions');
select throws_ok($$update public.upload_sessions set status = 'completed' where id = '33333333-3333-4333-8333-333333333333'$$, '42501', null, 'A cannot update upload sessions');
select throws_ok($$delete from public.upload_sessions where id = '33333333-3333-4333-8333-333333333333'$$, '42501', null, 'A cannot delete upload sessions');
select throws_ok($$insert into public.saves (user_id, game_id, save_kind, revision, object_key, size_bytes, sha256) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'battery', 2, 'a/new-save', 64, repeat('f', 64))$$, '42501', null, 'A cannot create saves');
select throws_ok($$update public.saves set revision = 2 where id = '55555555-5555-4555-8555-555555555555'$$, '42501', null, 'A cannot update saves');
select throws_ok($$delete from public.saves where id = '55555555-5555-4555-8555-555555555555'$$, '42501', null, 'A cannot delete saves');
reset role;

-- User B independently sees only B's rows and cannot mutate A's rows.
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is((select count(*)::integer from public.profiles), 1, 'B sees one profile');
select is((select count(*)::integer from public.games), 1, 'B sees one game');
select is((select count(*)::integer from public.upload_sessions), 1, 'B sees one upload session');
select is((select count(*)::integer from public.saves), 1, 'B sees one save');
select is_empty($$select id from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'B cannot read A profile');
select is_empty($$select id from public.games where id = '11111111-1111-4111-8111-111111111111'$$, 'B cannot read A game');
select is_empty($$select id from public.upload_sessions where id = '33333333-3333-4333-8333-333333333333'$$, 'B cannot read A upload session');
select is_empty($$select id from public.saves where id = '55555555-5555-4555-8555-555555555555'$$, 'B cannot read A save');
select is_empty($$update public.profiles set display_name = 'Intrusion' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning id$$, 'B cannot update A profile');
select is_empty($$update public.games set is_favorite = true where id = '11111111-1111-4111-8111-111111111111' returning id$$, 'B cannot update A favorite');
reset role;

-- A valid Auth identity without a trusted invitation receives no app data.
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select is((select public.is_invited_pixzer_user()), false, 'C is not authorized without an invitation');
select is((select count(*)::integer from public.profiles), 0, 'C cannot read own profile before invitation');
select is((select count(*)::integer from public.games), 0, 'C cannot read own game before invitation');
select is((select count(*)::integer from public.upload_sessions), 0, 'C cannot read own upload session before invitation');
select is((select count(*)::integer from public.saves), 0, 'C cannot read own save before invitation');
select is_empty($$update public.profiles set display_name = 'Unauthorized' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' returning id$$, 'C cannot update own profile before invitation');
select is_empty($$update public.games set is_favorite = true where id = '77777777-7777-4777-8777-777777777777' returning id$$, 'C cannot update own game before invitation');
reset role;

select throws_ok(
  $$insert into public.saves (user_id, game_id, save_kind, revision, object_key, size_bytes, sha256)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'battery', 2, 'test/a/wrong-owner-save', 64, repeat('e', 64))$$,
  '23503',
  null,
  'save owner/game foreign key prevents cross-owner association'
);

-- Confirm the successful mutations affected only the intended rows.
select is((select display_name from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'Owner A updated', 'A profile update persisted within transaction');
select is((select is_favorite from public.games where id = '11111111-1111-4111-8111-111111111111'), true, 'A favorite update persisted within transaction');
select is((select status from public.upload_sessions where id = '33333333-3333-4333-8333-333333333333'), 'pending', 'upload session state stayed unchanged');

select * from finish();
rollback;

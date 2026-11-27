-- Tests for direct messages. Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

-- helpers --------------------------------------------------------------------
create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end $$;
create function pg_temp.as_server() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
end $$;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', label; end if;
  raise notice 'ok - %', label;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;


-- users: M = creator, F = follows M, S = stranger -------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'm@example.com'),
  ('00000000-0000-0000-0000-0000000000e2', 'f@example.com'),
  ('00000000-0000-0000-0000-0000000000e3', 's@example.com');
select pg_temp.as_server();
insert into public.follows (follower_id, followee_id) values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1');
create temp table ids (name text primary key, id uuid);
grant all on ids to anon, authenticated;

-- starting conversations -------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select pg_temp.check(public.start_conversation('00000000-0000-0000-0000-0000000000e1') is null, 'strangers cannot start a conversation');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.check(public.start_conversation('00000000-0000-0000-0000-0000000000e1') is null, 'you cannot message someone just because you follow them');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into ids values ('c', public.start_conversation('00000000-0000-0000-0000-0000000000e2'));
select pg_temp.check((select id is not null from ids where name = 'c'), 'you can message people who follow you');
select pg_temp.check(public.start_conversation('00000000-0000-0000-0000-0000000000e2') = (select id from ids where name = 'c'), 'each pair has one conversation');
select pg_temp.check(public.start_conversation('00000000-0000-0000-0000-0000000000e1') is null, 'you cannot message yourself');
insert into public.messages (conversation_id, sender_id, body) values ((select id from ids where name = 'c'), '00000000-0000-0000-0000-0000000000e1', 'Thanks for following!');

-- reading and replying ------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.check(public.unread_conversations() = 1, 'new messages show as unread');
select pg_temp.check((select count(*) = 1 from public.messages), 'members read their messages');
insert into public.messages (conversation_id, sender_id, body) values ((select id from ids where name = 'c'), '00000000-0000-0000-0000-0000000000e2', 'Love your videos');
select pg_temp.check(public.unread_conversations() = 0, 'replying marks the conversation read');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select pg_temp.check((select count(*) = 0 from public.messages), 'outsiders cannot read messages');
select pg_temp.check((select count(*) = 0 from public.conversations), 'outsiders cannot see conversations');
do $$ begin
  insert into public.messages (conversation_id, sender_id, body) values ((select id from ids where name = 'c'), '00000000-0000-0000-0000-0000000000e3', 'hi');
  raise exception 'FAILED: an outsider posted into a conversation';
exception when insufficient_privilege then raise notice 'ok - outsiders cannot post into a conversation';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
do $$ begin
  insert into public.messages (conversation_id, sender_id, body) values ((select id from ids where name = 'c'), '00000000-0000-0000-0000-0000000000e1', 'fake');
  raise exception 'FAILED: sent a message as someone else';
exception when insufficient_privilege then raise notice 'ok - you cannot send as someone else';
end $$;
update public.messages set body = 'edited';
select pg_temp.check((select count(*) = 0 from public.messages where body = 'edited'), 'messages cannot be edited');

-- blocking --------------------------------------------------------------------------------
select pg_temp.as_server();
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
do $$ begin
  insert into public.messages (conversation_id, sender_id, body) values ((select id from ids where name = 'c'), '00000000-0000-0000-0000-0000000000e2', 'hello?');
  raise exception 'FAILED: messaged someone who blocked you';
exception when insufficient_privilege then raise notice 'ok - blocking stops messages';
end $$;

rollback;

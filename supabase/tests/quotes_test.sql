-- Tests for quote posts. Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', label; end if;
  raise notice 'ok - %', label;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'creator@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'fan@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'blocked@example.com');
insert into public.posts (id, author_id, body) values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000a1', 'original');
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into public.posts (id, author_id, body, repost_of_id) values
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-0000000000a2', 'so good', '00000000-0000-0000-0000-00000000b001');
reset role;
select pg_temp.check((select repost_count = 1 from public.posts where id = '00000000-0000-0000-0000-00000000b001'), 'a quote counts as a repost');
select pg_temp.check((select count(*) = 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and kind = 'repost'), 'the original author is told about the quote');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  insert into public.posts (author_id, body, repost_of_id) values ('00000000-0000-0000-0000-0000000000a2', '', '00000000-0000-0000-0000-00000000b001');
  raise exception 'FAILED: an empty quote was allowed';
exception when insufficient_privilege or check_violation then raise notice 'ok - a quote must say something';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
do $$ begin
  insert into public.posts (author_id, body, repost_of_id) values ('00000000-0000-0000-0000-0000000000a3', 'ha', '00000000-0000-0000-0000-00000000b001');
  raise exception 'FAILED: a blocked person quoted a post they cannot see';
exception when insufficient_privilege then raise notice 'ok - you cannot quote a post you cannot see';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
delete from public.posts where id = '00000000-0000-0000-0000-00000000b002';
reset role;
select pg_temp.check((select repost_count = 0 from public.posts where id = '00000000-0000-0000-0000-00000000b001'), 'deleting a quote lowers the repost count');

rollback;

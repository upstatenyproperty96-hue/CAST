-- Tests for the For You ranking. Run with: npm run test:db
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


-- users: A and D are creators, B is a viewer, C is a stranger ------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@example.com');

select pg_temp.as_server();
-- A posts three videos about Tech (topic 2), D posts one about Food (topic 6). All equal otherwise.
insert into public.videos (id, creator_id, title, status, visibility, published_at, rights_confirmed, topic_id, duration_s) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'A1', 'ready', 'public', now() - interval '2 hours', true, 2, 60),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'A2', 'ready', 'public', now() - interval '2 hours', true, 2, 60),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'A3', 'ready', 'public', now() - interval '2 hours', true, 2, 60),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000d1', 'D1', 'ready', 'public', now() - interval '2 hours', true, 6, 60);
insert into public.posts (id, author_id, body, video_id, created_at) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '', '30000000-0000-0000-0000-000000000001', now() - interval '2 hours'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '', '30000000-0000-0000-0000-000000000002', now() - interval '2 hours'),
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '', '30000000-0000-0000-0000-000000000003', now() - interval '2 hours'),
  ('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000d1', '', '30000000-0000-0000-0000-000000000004', now() - interval '2 hours');

create temp table feed_ids (pos int, id uuid);
grant all on feed_ids to anon, authenticated;

-- signed out -------------------------------------------------------------------
select pg_temp.as_anon();
select pg_temp.check((select count(*) = 4 from public.for_you_feed()), 'signed-out visitors get a For You feed');
insert into feed_ids select row_number() over (), id from public.for_you_feed();
select pg_temp.check(
  (select pos from feed_ids where id = '40000000-0000-0000-0000-000000000004') <= 2,
  'one creator cannot fill the top of the feed');
truncate feed_ids;

-- B watched all of A1, and liked nothing. They picked Food at sign-up. --------------
select pg_temp.as_server();
insert into public.view_events (video_id, viewer_id, session_id, watched_s, completed) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', gen_random_uuid(), 60, true);
insert into public.user_topics (user_id, topic_id) values ('00000000-0000-0000-0000-0000000000b1', 6);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into feed_ids select row_number() over (), id from public.for_you_feed();
select pg_temp.check(
  (select pos from feed_ids where id = '40000000-0000-0000-0000-000000000004') = 1,
  'topics the viewer picked rank first');
select pg_temp.check(
  (select pos from feed_ids where id = '40000000-0000-0000-0000-000000000001') = 4,
  'videos the viewer already watched sink to the bottom');
select pg_temp.check((select count(*) = 2 from public.my_topic_affinity()), 'viewers see their own topic interests');
truncate feed_ids;

-- C must not see anything about B's viewing ------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select count(*) = 0 from public.my_topic_affinity()), 'topic interests are private');
select pg_temp.check((select count(*) = 0 from public.my_recently_seen()), 'watch history is private');

rollback;

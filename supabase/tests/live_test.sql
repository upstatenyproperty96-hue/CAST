-- Tests for live streaming records. Run with: npm run test:db
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


insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'streamer@example.com'),
  ('00000000-0000-0000-0000-0000000000f2', 'viewer@example.com'),
  ('00000000-0000-0000-0000-0000000000f3', 'blocked@example.com');
select pg_temp.as_server();
insert into public.live_streams (creator_id, mux_live_stream_id, mux_playback_id, status)
values ('00000000-0000-0000-0000-0000000000f1', 'ls1', 'pb1', 'active');
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3');

select pg_temp.as_anon();
select pg_temp.check((select count(*) = 1 from public.live_streams where status = 'active'), 'anyone can see who is live');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
select pg_temp.check((select count(*) = 0 from public.live_streams), 'blocked people cannot see the stream');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
update public.live_streams set status = 'idle', mux_playback_id = 'hijack';
select pg_temp.check((select mux_playback_id = 'pb1' from public.live_streams), 'only the server can change a live stream');
do $$ begin
  insert into public.live_streams (creator_id, mux_live_stream_id, mux_playback_id) values ('00000000-0000-0000-0000-0000000000f2', 'x', 'y');
  raise exception 'FAILED: a user created a live stream row';
exception when insufficient_privilege then raise notice 'ok - users cannot create live stream records';
end $$;

rollback;

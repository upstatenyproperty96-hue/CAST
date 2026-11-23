-- Security tests for Row Level Security. Run with: npm run test:db
-- Each check raises an exception on failure, so the script stops at the first broken rule.
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

-- users: A = creator, B = fan, C = stranger ------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'maya@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'fan@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'other@example.com');

select pg_temp.check((select count(*) = 3 from public.profiles), 'sign-up creates a profile for every user');

-- server creates videos (as the Mux upload route does)
select pg_temp.as_server();
insert into public.videos (id, creator_id, title, status, visibility, published_at, rights_confirmed) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Public ready', 'ready', 'public', now() - interval '1 hour', true),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Still processing', 'processing', 'public', null, true),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'Followers only', 'ready', 'followers', now() - interval '1 hour', true);
insert into public.posts (id, author_id, body, video_id) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'New video', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Text only post', null);

-- profiles ---------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.profiles set bio = 'hacked' where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select bio = '' from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'cannot edit someone else''s profile');
update public.profiles set bio = 'I love travel videos', is_admin = true, is_verified = true, follower_count = 999999
  where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select bio = 'I love travel videos' and not is_admin and not is_verified and follower_count = 0
  from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'can edit own bio but not admin, verified, or counts');

-- videos -----------------------------------------------------------------------
select pg_temp.check((select count(*) = 1 from public.videos), 'fan sees only ready public videos before following');
do $$ begin
  insert into public.videos (creator_id, title) values ('00000000-0000-0000-0000-00000000000b', 'sneaky');
  raise exception 'FAILED: user inserted a video directly';
exception when insufficient_privilege then raise notice 'ok - users cannot create videos without the server';
end $$;

insert into public.follows (follower_id, followee_id) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) = 2 from public.videos), 'following unlocks followers-only videos');

do $$ begin
  insert into public.follows (follower_id, followee_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c');
  raise exception 'FAILED: followed on behalf of someone else';
exception when insufficient_privilege then raise notice 'ok - cannot follow on behalf of someone else';
end $$;

select pg_temp.as_anon();
select pg_temp.check((select count(*) = 1 from public.videos), 'signed-out visitors see only public ready videos');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) = 3 from public.videos), 'creator sees all own videos, including drafts');
select pg_temp.check((select follower_count = 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'follower count updates');
update public.videos set title = 'Renamed', status = 'ready', mux_playback_id = 'evil', access = 'members', view_count = 1000000
  where id = '10000000-0000-0000-0000-000000000002';
select pg_temp.check((select title = 'Renamed' and status = 'processing' and mux_playback_id is null and access = 'free' and view_count = 0
  from public.videos where id = '10000000-0000-0000-0000-000000000002'), 'creator edits title but not status, playback, access, or views');

-- posts ------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  insert into public.posts (author_id, body, video_id) values ('00000000-0000-0000-0000-00000000000c', 'stolen', '10000000-0000-0000-0000-000000000001');
  raise exception 'FAILED: posted someone else''s video';
exception when insufficient_privilege then raise notice 'ok - cannot post another creator''s video as own';
end $$;
do $$ begin
  insert into public.posts (author_id, body, like_count) values ('00000000-0000-0000-0000-00000000000c', 'fake likes', 5000);
  raise exception 'FAILED: inflated like count';
exception when insufficient_privilege then raise notice 'ok - cannot create a post with fake counts';
end $$;

-- reactions and fan profiles -------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.reactions (user_id, post_id, kind) values
  ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', 'like'),
  ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', 'repost');
select pg_temp.check((select like_count = 1 and repost_count = 1 from public.posts where id = '20000000-0000-0000-0000-000000000001'), 'like and repost counts update');
insert into public.playlists (id, owner_id, title) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Best travel tips');
insert into public.playlist_items (playlist_id, video_id, position) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1);
select pg_temp.check(true, 'a fan can curate a playlist of a creator''s video');
do $$ begin
  insert into public.playlist_items (playlist_id, video_id, position) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 2);
  raise exception 'FAILED: added an unpublished video to a playlist';
exception when insufficient_privilege then raise notice 'ok - cannot add an unpublished video to a playlist';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) = 2 from public.reactions where user_id = '00000000-0000-0000-0000-00000000000b'), 'a fan''s likes and reposts show on their profile');
select pg_temp.check((select count(*) = 1 from public.playlist_items where playlist_id = '30000000-0000-0000-0000-000000000001'), 'others can see a fan''s curated playlist');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.profiles set likes_public = false where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) = 1 and bool_and(kind = 'repost') from public.reactions where user_id = '00000000-0000-0000-0000-00000000000b'), 'hiding likes hides them, reposts stay public');

do $$ begin
  insert into public.reactions (user_id, post_id, kind) values ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', 'like');
  raise exception 'FAILED: liked as someone else';
exception when insufficient_privilege or unique_violation then raise notice 'ok - cannot like as someone else';
end $$;

-- notifications ------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) = 3 from public.notifications), 'creator gets follow, like, and repost notifications');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) = 0 from public.notifications), 'nobody reads someone else''s notifications');

-- studio privacy -------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.studio_projects (creator_id, title, origin) values ('00000000-0000-0000-0000-00000000000a', 'Secret draft', 'desktop');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) = 0 from public.studio_projects), 'studio drafts are private');
select pg_temp.check((select count(*) = 0 from public.view_events), 'raw view data is server-only');
select pg_temp.check((select count(*) = 0 from public.creator_accounts), 'payout accounts are private');

-- subscriptions ----------------------------------------------------------------------
do $$ begin
  insert into public.subscriptions (subscriber_id, owner_id, status, current_period_end)
  values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'active', now() + interval '30 days');
  raise exception 'FAILED: subscribed without paying';
exception when insufficient_privilege then raise notice 'ok - cannot subscribe without the server confirming payment';
end $$;
select pg_temp.as_server();
update public.videos set access = 'members', visibility = 'public' where id = '10000000-0000-0000-0000-000000000003';
insert into public.subscriptions (subscriber_id, owner_id, status, current_period_end)
  values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'active', now() + interval '30 days');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) = 0 from public.videos where id = '10000000-0000-0000-0000-000000000003'), 'subscriber-only videos are hidden from followers who are not subscribed');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) = 1 from public.videos where id = '10000000-0000-0000-0000-000000000003'), 'paying subscribers can watch subscriber-only videos');

-- blocking ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) = 0 from public.posts where author_id = '00000000-0000-0000-0000-00000000000a'), 'blocked users cannot see the blocker''s posts');
do $$ begin
  insert into public.comments (post_id, author_id, body) values ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', 'hi');
  raise exception 'FAILED: blocked user commented';
exception when insufficient_privilege then raise notice 'ok - blocked users cannot comment on the blocker''s posts';
end $$;
do $$ begin
  insert into public.follows (follower_id, followee_id) values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a');
  raise exception 'FAILED: blocked user followed';
exception when insufficient_privilege then raise notice 'ok - blocked users cannot follow the blocker';
end $$;

-- reports ------------------------------------------------------------------------------
insert into public.reports (reporter_id, user_id, reason) values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'spam');
select pg_temp.check((select count(*) = 0 from public.reports), 'reporters cannot read the report queue');

rollback;

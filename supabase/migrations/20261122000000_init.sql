-- Cast: initial schema
-- Every table has Row Level Security enabled. Clients (browser, phone) only use the
-- public "anon" key, so these policies are the real security boundary.
-- Server-only work (Mux webhooks, counters, stats roll-ups) uses the service role,
-- which bypasses RLS and never leaves the server.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.video_status as enum ('uploading', 'processing', 'ready', 'failed');
create type public.video_visibility as enum ('public', 'followers', 'unlisted');
-- Access level is the monetization hook: 'members' = subscribers only, unused until payments launch.
create type public.video_access as enum ('free', 'members');
create type public.video_aspect as enum ('portrait', 'landscape', 'square');
create type public.reaction_kind as enum ('like', 'repost');
create type public.notification_kind as enum ('follow', 'like', 'comment', 'repost', 'new_upload');
create type public.report_status as enum ('open', 'actioned', 'dismissed');
create type public.project_origin as enum ('mobile', 'desktop');

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle citext not null unique
    check (handle ~ '^[a-zA-Z0-9_]{3,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 300),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://[^"''()<>\s]+$'),
  banner_url text check (banner_url is null or banner_url ~ '^https://[^"''()<>\s]+$'),
  website_url text check (website_url is null or website_url ~ '^https://'),
  is_creator boolean not null default false,   -- has published a video (badge only; everyone has a full profile)
  likes_public boolean not null default true,   -- show the Likes tab on this profile
  is_verified boolean not null default false,  -- only admins (service role) set this
  is_admin boolean not null default false,     -- only service role sets this
  follower_count integer not null default 0,
  following_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Users may edit their own profile, but never the protected columns.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  -- pg_trigger_depth() > 1 means a counter trigger (follows) is making this change.
  if auth.role() <> 'service_role' and pg_trigger_depth() <= 1 then
    new.is_verified := old.is_verified;
    new.is_admin := old.is_admin;
    new.follower_count := old.follower_count;
    new.following_count := old.following_count;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Create a profile automatically on sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(coalesce(split_part(new.email, '@', 1), 'user'), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := 'user' || base; end if;
  base := left(base, 22);
  candidate := base;
  while exists (select 1 from public.profiles where handle = candidate) loop
    candidate := base || floor(random() * 100000)::int::text;
  end loop;
  insert into public.profiles (id, handle, display_name)
  values (new.id, candidate, coalesce(new.raw_user_meta_data ->> 'full_name', candidate));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Creator payout accounts (monetization foundation; Stripe Connect later)
-- Never stores bank details: Stripe holds those.
-- ---------------------------------------------------------------------------
create table public.creator_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  country char(2),
  stripe_account_id text unique,          -- set only by the server
  payouts_enabled boolean not null default false,
  tax_status text not null default 'not_started'
    check (tax_status in ('not_started', 'pending', 'verified')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Subscriptions (like X Subscriptions): ANY profile, creator or fan, can offer a
-- monthly subscription once payments launch. Built now, switched off until then.
-- Only the server (after Stripe confirms payment) writes these tables.
-- ---------------------------------------------------------------------------
create table public.subscription_offers (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  price_cents integer not null check (price_cents between 99 and 99999),
  currency char(3) not null default 'usd',
  perks text not null default '' check (char_length(perks) <= 1000),
  is_active boolean not null default false,
  stripe_price_id text unique,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  subscriber_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('active', 'past_due', 'canceled')),
  current_period_end timestamptz not null,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  primary key (subscriber_id, owner_id),
  check (subscriber_id <> owner_id)
);
create index subscriptions_owner_idx on public.subscriptions (owner_id);

create or replace function public.is_subscribed_to(owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subscriptions s
    where s.subscriber_id = auth.uid() and s.owner_id = owner
      and s.status = 'active' and s.current_period_end > now());
$$;

-- ---------------------------------------------------------------------------
-- Topics
-- ---------------------------------------------------------------------------
create table public.topics (
  id smallserial primary key,
  slug text not null unique,
  name text not null,
  cover_url text,
  sort_order smallint not null default 0
);

create table public.user_topics (
  user_id uuid not null references public.profiles (id) on delete cascade,
  topic_id smallint not null references public.topics (id) on delete cascade,
  primary key (user_id, topic_id)
);

-- ---------------------------------------------------------------------------
-- Follows and blocks
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Policies can't read other people's blocks (RLS hides them), so check through a definer function.
create or replace function public.is_blocked_by(blocker uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks b where b.blocker_id = blocker and b.blocked_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Videos
-- ---------------------------------------------------------------------------
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  description text not null default '' check (char_length(description) <= 5000),
  status public.video_status not null default 'uploading',
  visibility public.video_visibility not null default 'public',
  access public.video_access not null default 'free',
  aspect public.video_aspect,
  duration_s numeric(8, 2) check (duration_s is null or duration_s <= 1800), -- 30 minute cap
  source_video_id uuid references public.videos (id) on delete set null,     -- clip -> full video
  topic_id smallint references public.topics (id),
  rights_confirmed boolean not null default false,
  -- Mux identifiers: written only by the server
  mux_upload_id text unique,
  mux_asset_id text unique,
  mux_playback_id text,
  thumbnail_time_s numeric(8, 2) not null default 0,
  view_count bigint not null default 0,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index videos_creator_idx on public.videos (creator_id, published_at desc);
create index videos_topic_idx on public.videos (topic_id, published_at desc);
create index videos_source_idx on public.videos (source_video_id);

create or replace function public.protect_video_columns()
returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' and pg_trigger_depth() <= 1 then
    new.creator_id := old.creator_id;
    new.status := old.status;
    new.mux_upload_id := old.mux_upload_id;
    new.mux_asset_id := old.mux_asset_id;
    new.mux_playback_id := old.mux_playback_id;
    new.duration_s := old.duration_s;
    new.aspect := old.aspect;
    new.view_count := old.view_count;
    new.like_count := old.like_count;
    new.comment_count := old.comment_count;
    new.access := old.access; -- members-only unlocks with payments
    -- a clip may only point at the same creator's video
    if new.source_video_id is distinct from old.source_video_id and new.source_video_id is not null
       and not exists (select 1 from public.videos v where v.id = new.source_video_id and v.creator_id = old.creator_id) then
      raise exception 'source video must belong to the same creator';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger videos_protect before update on public.videos
  for each row execute function public.protect_video_columns();

create table public.video_topics (
  video_id uuid not null references public.videos (id) on delete cascade,
  topic_id smallint not null references public.topics (id) on delete cascade,
  primary key (video_id, topic_id)
);

-- Can the current user watch this video?
create or replace function public.can_view_video(v public.videos)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    v.creator_id = auth.uid()
    or public.is_admin()
    or (
      v.status = 'ready'
      and v.published_at is not null
      and v.published_at <= now()
      and (v.access = 'free' or public.is_subscribed_to(v.creator_id))
      and not public.is_blocked_by(v.creator_id)
      and (
        v.visibility in ('public', 'unlisted')
        or (v.visibility = 'followers' and exists (
              select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = v.creator_id))
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Posts (the feed item). A published video creates one post.
-- ---------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 1000),
  video_id uuid references public.videos (id) on delete cascade,
  repost_of_id uuid references public.posts (id) on delete cascade,
  like_count integer not null default 0,
  repost_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  check (body <> '' or video_id is not null or repost_of_id is not null)
);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_created_idx on public.posts (created_at desc);
create index posts_video_idx on public.posts (video_id);

-- ---------------------------------------------------------------------------
-- Playlists
-- ---------------------------------------------------------------------------
create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  -- a creator's own series, or a fan's curated collection of anyone's videos
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  created_at timestamptz not null default now()
);

create table public.playlist_items (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  position integer not null,
  primary key (playlist_id, video_id)
);

-- ---------------------------------------------------------------------------
-- Comments and reactions
-- ---------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  like_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);

-- Only one level of replies.
create or replace function public.check_comment_depth()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null and exists (
    select 1 from public.comments c where c.id = new.parent_id and (c.parent_id is not null or c.post_id <> new.post_id)
  ) then
    raise exception 'replies can only be one level deep';
  end if;
  return new;
end $$;
create trigger comments_depth before insert on public.comments
  for each row execute function public.check_comment_depth();

create table public.reactions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  kind public.reaction_kind not null,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id, kind)
);
create index reactions_post_idx on public.reactions (post_id);

-- ---------------------------------------------------------------------------
-- Studio: assets and projects (edit lists)
-- ---------------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('recording', 'upload', 'music')),
  video_id uuid references public.videos (id) on delete set null,
  title text not null default '',
  created_at timestamptz not null default now()
);

create table public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'Untitled project' check (char_length(title) <= 120),
  origin public.project_origin not null,
  edit_list jsonb not null default '{"version":1,"clips":[]}'::jsonb
    check (pg_column_size(edit_list) < 262144),
  output_video_id uuid references public.videos (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Views and stats (accurate watch time is the payout foundation)
-- Inserted only by the server, after validating the session.
-- ---------------------------------------------------------------------------
create table public.view_events (
  id bigserial primary key,
  video_id uuid not null references public.videos (id) on delete cascade,
  viewer_id uuid references public.profiles (id) on delete set null,
  session_id uuid not null,
  watched_s numeric(8, 2) not null check (watched_s >= 0 and watched_s <= 1800),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (video_id, session_id)  -- dedupe: one row per viewing session
);
create index view_events_video_idx on public.view_events (video_id, created_at);

create table public.video_stats_daily (
  video_id uuid not null references public.videos (id) on delete cascade,
  day date not null,
  views integer not null default 0,
  watch_time_s bigint not null default 0,
  completions integer not null default 0,
  primary key (video_id, day)
);

-- ---------------------------------------------------------------------------
-- Notifications and reports
-- ---------------------------------------------------------------------------
create table public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  post_id uuid references public.posts (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.reports (
  id bigserial primary key,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  check (num_nonnulls(post_id, user_id, comment_id) = 1)
);

-- ---------------------------------------------------------------------------
-- Counters (kept in sync by triggers so feeds never count rows)
-- ---------------------------------------------------------------------------
create or replace function public.bump_follow_counts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set follower_count = follower_count + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    insert into public.notifications (user_id, actor_id, kind) values (new.followee_id, new.follower_id, 'follow');
  else
    update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = old.followee_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
  end if;
  return null;
end $$;
create trigger follows_count after insert or delete on public.follows
  for each row execute function public.bump_follow_counts();

create or replace function public.bump_reaction_counts()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
  delta int;
  author uuid;
begin
  if tg_op = 'INSERT' then r := new; delta := 1; else r := old; delta := -1; end if;
  if r.kind = 'like' then
    update public.posts set like_count = greatest(like_count + delta, 0) where id = r.post_id returning author_id into author;
  else
    update public.posts set repost_count = greatest(repost_count + delta, 0) where id = r.post_id returning author_id into author;
  end if;
  if tg_op = 'INSERT' and author is not null and author <> r.user_id then
    insert into public.notifications (user_id, actor_id, kind, post_id)
    values (author, r.user_id, case when r.kind = 'like' then 'like' else 'repost' end::public.notification_kind, r.post_id);
  end if;
  return null;
end $$;
create trigger reactions_count after insert or delete on public.reactions
  for each row execute function public.bump_reaction_counts();

create or replace function public.bump_comment_counts()
returns trigger language plpgsql security definer set search_path = '' as $$
declare author uuid;
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id returning author_id into author;
    if author is not null and author <> new.author_id then
      insert into public.notifications (user_id, actor_id, kind, post_id) values (author, new.author_id, 'comment', new.post_id);
    end if;
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
create trigger comments_count after insert or delete on public.comments
  for each row execute function public.bump_comment_counts();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.creator_accounts enable row level security;
alter table public.subscription_offers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.topics enable row level security;
alter table public.user_topics enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.videos enable row level security;
alter table public.video_topics enable row level security;
alter table public.posts enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.assets enable row level security;
alter table public.studio_projects enable row level security;
alter table public.view_events enable row level security;
alter table public.video_stats_daily enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;

-- profiles: public read, owner update. Inserts happen through the sign-up trigger.
create policy "profiles are public" on public.profiles for select using (true);
create policy "edit own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- creator_accounts: owner reads; only the server writes.
create policy "read own creator account" on public.creator_accounts for select using (user_id = auth.uid());

-- subscriptions: active offers are public; a subscription is visible to its two parties.
create policy "active offers are public" on public.subscription_offers for select using (is_active or owner_id = auth.uid());
create policy "parties see subscription" on public.subscriptions for select using (subscriber_id = auth.uid() or owner_id = auth.uid());

-- topics: public read; admins manage through the service role.
create policy "topics are public" on public.topics for select using (true);

create policy "read own interests" on public.user_topics for select using (user_id = auth.uid());
create policy "add own interests" on public.user_topics for insert with check (user_id = auth.uid());
create policy "remove own interests" on public.user_topics for delete using (user_id = auth.uid());

-- follows: public read, a user follows/unfollows only as themself.
create policy "follows are public" on public.follows for select using (true);
create policy "follow as self" on public.follows for insert with check (
  follower_id = auth.uid()
  and not public.is_blocked_by(followee_id)
);
create policy "unfollow as self" on public.follows for delete using (follower_id = auth.uid());

create policy "see own blocks" on public.blocks for select using (blocker_id = auth.uid());
create policy "block as self" on public.blocks for insert with check (blocker_id = auth.uid());
create policy "unblock as self" on public.blocks for delete using (blocker_id = auth.uid());

-- videos: visible per can_view_video; creators manage their own metadata.
-- Creation goes through the server (it needs a Mux upload URL), so no insert policy.
create policy "view allowed videos" on public.videos for select using (public.can_view_video(videos));
create policy "creator edits own video" on public.videos for update
  using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy "creator deletes own video" on public.videos for delete using (creator_id = auth.uid() or public.is_admin());

create policy "video topics follow video" on public.video_topics for select using (
  exists (select 1 from public.videos v where v.id = video_id and public.can_view_video(v))
);
create policy "creator tags own video" on public.video_topics for insert with check (
  exists (select 1 from public.videos v where v.id = video_id and v.creator_id = auth.uid())
);
create policy "creator untags own video" on public.video_topics for delete using (
  exists (select 1 from public.videos v where v.id = video_id and v.creator_id = auth.uid())
);

-- posts: readable when there is no video or the video is viewable.
create policy "read posts" on public.posts for select using (
  not public.is_blocked_by(author_id)
  and (video_id is null or exists (select 1 from public.videos v where v.id = video_id and public.can_view_video(v)))
);
create policy "post as self" on public.posts for insert with check (
  author_id = auth.uid()
  and like_count = 0 and repost_count = 0 and comment_count = 0
  and (video_id is null or exists (select 1 from public.videos v where v.id = video_id and v.creator_id = auth.uid()))
);
create policy "delete own post" on public.posts for delete using (author_id = auth.uid() or public.is_admin());

-- playlists: public read; owner manages.
create policy "playlists are public" on public.playlists for select using (true);
create policy "create own playlist" on public.playlists for insert with check (owner_id = auth.uid());
create policy "edit own playlist" on public.playlists for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "delete own playlist" on public.playlists for delete using (owner_id = auth.uid());

create policy "playlist items follow video" on public.playlist_items for select using (
  exists (select 1 from public.videos v where v.id = video_id and public.can_view_video(v))
);
-- Anyone can curate playlists of videos they can watch (fans build audiences this way).
create policy "owner adds viewable videos" on public.playlist_items for insert with check (
  exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())
  and exists (select 1 from public.videos v where v.id = video_id and public.can_view_video(v))
);
create policy "owner reorders" on public.playlist_items for update using (
  exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())
);
create policy "owner removes" on public.playlist_items for delete using (
  exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())
);

-- comments: readable when the post is; write as self on a readable post.
create policy "read comments" on public.comments for select using (
  exists (select 1 from public.posts p where p.id = post_id)
);
create policy "comment as self" on public.comments for insert with check (
  author_id = auth.uid() and like_count = 0
  and exists (select 1 from public.posts p where p.id = post_id)
  and not exists (select 1 from public.posts p where p.id = post_id and public.is_blocked_by(p.author_id))
);
create policy "delete own or on own post" on public.comments for delete using (
  author_id = auth.uid()
  or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  or public.is_admin()
);

-- reactions
-- Reposts are always public. Likes are public unless the user hid their Likes tab.
create policy "reactions are visible" on public.reactions for select using (
  kind = 'repost'
  or user_id = auth.uid()
  or exists (select 1 from public.profiles pr where pr.id = user_id and pr.likes_public)
);
create policy "react as self" on public.reactions for insert with check (
  user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id)
);
create policy "unreact as self" on public.reactions for delete using (user_id = auth.uid());

-- studio: private to the creator
create policy "own assets" on public.assets for select using (owner_id = auth.uid());
create policy "add own assets" on public.assets for insert with check (owner_id = auth.uid());
create policy "edit own assets" on public.assets for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "delete own assets" on public.assets for delete using (owner_id = auth.uid());

create policy "own projects" on public.studio_projects for select using (creator_id = auth.uid());
create policy "add own projects" on public.studio_projects for insert with check (creator_id = auth.uid());
create policy "edit own projects" on public.studio_projects for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy "delete own projects" on public.studio_projects for delete using (creator_id = auth.uid());

-- analytics: creators read stats for their own videos; raw events are server-only.
create policy "creator reads own stats" on public.video_stats_daily for select using (
  exists (select 1 from public.videos v where v.id = video_id and v.creator_id = auth.uid())
);

-- notifications: owner reads and marks read.
create policy "own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "mark own read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reports: anyone signed in can file; only admins read.
create policy "file report" on public.reports for insert with check (reporter_id = auth.uid() and status = 'open');
create policy "admins read reports" on public.reports for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed topics from the design
-- ---------------------------------------------------------------------------
insert into public.topics (slug, name, sort_order) values
  ('travel', 'Travel', 1), ('tech', 'Tech', 2), ('business', 'Business', 3),
  ('education', 'Education', 4), ('health', 'Health', 5), ('food', 'Food', 6),
  ('lifestyle', 'Lifestyle', 7), ('sports', 'Sports', 8);

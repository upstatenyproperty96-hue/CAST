-- Week 2: For You ranking, view tracking, stats roll-up, onboarding, avatar storage.

alter table public.profiles add column onboarded boolean not null default false;

-- ---------------------------------------------------------------------------
-- For You feed. Runs as the caller (security invoker), so Row Level Security
-- still hides anything the viewer may not see.
-- Score = engagement + topic match + follow boost, decayed by age.
-- ---------------------------------------------------------------------------
create or replace function public.for_you_feed(p_limit int default 30, p_offset int default 0)
returns setof public.posts
language sql stable security invoker set search_path = '' as $$
  with me as (select auth.uid() as id),
  my_topics as (select topic_id from public.user_topics where user_id = (select id from me)),
  my_follows as (select followee_id from public.follows where follower_id = (select id from me)),
  candidates as (
    select p.*, v.topic_id
    from public.posts p
    left join public.videos v on v.id = p.video_id
    where p.created_at > now() - interval '30 days'
      and p.repost_of_id is null
  )
  select c.id, c.author_id, c.body, c.video_id, c.repost_of_id, c.like_count, c.repost_count, c.comment_count, c.created_at
  from candidates c
  order by (
    (1 + ln(1 + c.like_count + 2 * c.repost_count + 3 * c.comment_count))
    * (case when c.topic_id in (select topic_id from my_topics) then 2.0 else 1.0 end)
    * (case when c.author_id in (select followee_id from my_follows) then 1.5 else 1.0 end)
    * (case when c.video_id is not null then 1.3 else 1.0 end)
  ) / power(extract(epoch from (now() - c.created_at)) / 3600 + 2, 1.5) desc,
  c.created_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;

-- ---------------------------------------------------------------------------
-- View tracking. Clients call record_view; it only accepts videos the caller
-- can actually watch, keeps one row per viewing session, and counts a view
-- once a session passes 3 seconds. Signed-in viewers count at most once per
-- video every 30 minutes.
-- (Before payouts launch: add IP/device fraud checks for signed-out views.)
-- ---------------------------------------------------------------------------
create or replace function public.record_view(p_video_id uuid, p_session_id uuid, p_watched_s numeric, p_completed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.videos;
  prev numeric;
  w numeric := least(greatest(coalesce(p_watched_s, 0), 0), 1800);
begin
  select * into v from public.videos where id = p_video_id;
  if not found or not public.can_view_video(v) or v.status <> 'ready' then return; end if;
  if v.duration_s is not null then w := least(w, v.duration_s); end if;

  select watched_s into prev from public.view_events where video_id = p_video_id and session_id = p_session_id;
  if prev is null then
    if auth.uid() is not null and exists (
      select 1 from public.view_events e where e.video_id = p_video_id and e.viewer_id = auth.uid()
        and e.created_at > now() - interval '30 minutes') then
      return;
    end if;
    insert into public.view_events (video_id, viewer_id, session_id, watched_s, completed)
    values (p_video_id, auth.uid(), p_session_id, w, coalesce(p_completed, false))
    on conflict (video_id, session_id) do nothing;
    if w >= 3 then update public.videos set view_count = view_count + 1 where id = p_video_id; end if;
  elsif w > prev then
    update public.view_events set watched_s = w, completed = completed or coalesce(p_completed, false)
    where video_id = p_video_id and session_id = p_session_id;
    if prev < 3 and w >= 3 then update public.videos set view_count = view_count + 1 where id = p_video_id; end if;
  end if;
end $$;

revoke all on function public.record_view(uuid, uuid, numeric, boolean) from public;
grant execute on function public.record_view(uuid, uuid, numeric, boolean) to anon, authenticated;

-- Daily roll-up for Studio Analytics. Run by a scheduled job (server only).
create or replace function public.rollup_video_stats(p_day date)
returns void language sql security definer set search_path = '' as $$
  insert into public.video_stats_daily (video_id, day, views, watch_time_s, completions)
  select video_id, p_day, count(*) filter (where watched_s >= 3), coalesce(sum(watched_s), 0)::bigint, count(*) filter (where completed)
  from public.view_events
  where created_at >= p_day and created_at < p_day + 1
  group by video_id
  on conflict (video_id, day) do update
    set views = excluded.views, watch_time_s = excluded.watch_time_s, completions = excluded.completions;
$$;
revoke all on function public.rollup_video_stats(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Avatar and banner images: anyone can view; each user writes only inside
-- their own folder (avatars/<user id>/...). 5 MB, images only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "profile images are public" on storage.objects for select
  using (bucket_id = 'profile-images');
create policy "upload own profile images" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace own profile images" on storage.objects for update to authenticated
  using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own profile images" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);

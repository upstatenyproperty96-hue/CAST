-- ---------------------------------------------------------------------------
-- Smarter For You feed.
-- Ranks recent posts by:
--   engagement (likes, reposts, comments)
--   x how much this viewer cares about the topic (learned from what they watch,
--     finish and like, plus the topics they picked)
--   x whether they follow the creator
--   x how well the video holds viewers (completion rate)
--   / age
-- Videos the viewer has already watched sink, and one creator can't fill a page.
-- Signed-out viewers get the same ranking without the personal parts.
-- ---------------------------------------------------------------------------

-- Topic interest for the signed-in viewer. Only ever returns the caller's own data.
create or replace function public.my_topic_affinity()
returns table (topic_id smallint, weight numeric)
language sql stable security definer set search_path = '' as $$
  with signals as (
    -- Watching: each video counts by the share of it they watched (max 1).
    select v.topic_id, least(ve.watched_s / nullif(v.duration_s, 0), 1) as s
    from public.view_events ve
    join public.videos v on v.id = ve.video_id
    where ve.viewer_id = auth.uid() and ve.created_at > now() - interval '30 days' and v.topic_id is not null
    union all
    -- Liking and reposting count double.
    select v.topic_id, 2
    from public.reactions r
    join public.posts p on p.id = r.post_id
    join public.videos v on v.id = p.video_id
    where r.user_id = auth.uid() and r.created_at > now() - interval '30 days' and v.topic_id is not null
    union all
    -- Topics they picked during onboarding.
    select ut.topic_id, 3 from public.user_topics ut where ut.user_id = auth.uid()
  )
  select s.topic_id, 1 + ln(1 + sum(s.s)) from signals s group by s.topic_id;
$$;

-- Videos the signed-in viewer watched for more than a few seconds recently.
create or replace function public.my_recently_seen()
returns table (video_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct ve.video_id from public.view_events ve
  where ve.viewer_id = auth.uid() and ve.watched_s >= 3 and ve.created_at > now() - interval '14 days';
$$;

-- How well each recent video holds its audience, smoothed so a video with
-- 2 views can't beat one with 2,000. Returns only ids and a score.
create or replace function public.video_quality()
returns table (video_id uuid, quality numeric)
language sql stable security definer set search_path = '' as $$
  select s.video_id, 0.7 + 0.6 * ((sum(s.completions) + 1.0) / (sum(s.views) + 4.0))
  from public.video_stats_daily s
  where s.day > current_date - 30
  group by s.video_id;
$$;

revoke all on function public.my_topic_affinity() from public;
revoke all on function public.my_recently_seen() from public;
revoke all on function public.video_quality() from public;
grant execute on function public.my_topic_affinity() to anon, authenticated;
grant execute on function public.my_recently_seen() to anon, authenticated;
grant execute on function public.video_quality() to anon, authenticated;

-- Same signature and result as before, so the app doesn't change.
-- security invoker: row level security still decides which posts the viewer may see
-- (blocks, followers-only videos, takedowns).
create or replace function public.for_you_feed(p_limit int default 30, p_offset int default 0)
returns setof public.posts
language sql stable security invoker set search_path = '' as $$
  with affinity as (select * from public.my_topic_affinity()),
  seen as (select * from public.my_recently_seen()),
  quality as (select * from public.video_quality()),
  my_follows as (select followee_id from public.follows where follower_id = auth.uid()),
  scored as (
    select p.*,
      (1 + ln(1 + p.like_count + 2 * p.repost_count + 3 * p.comment_count))
      * coalesce((select a.weight from affinity a where a.topic_id = v.topic_id), 1.0)
      * (case when p.author_id in (select followee_id from my_follows) then 1.5 else 1.0 end)
      * (case when p.video_id is not null then 1.3 else 1.0 end)
      * coalesce((select q.quality from quality q where q.video_id = p.video_id), 1.0)
      * (case when p.video_id in (select video_id from seen) then 0.25 else 1.0 end)
      * (case when p.author_id = auth.uid() then 0.5 else 1.0 end)
      / power(extract(epoch from (now() - p.created_at)) / 3600 + 2, 1.5) as base_score
    from public.posts p
    left join public.videos v on v.id = p.video_id
    where p.created_at > now() - interval '30 days'
      and p.repost_of_id is null
  ),
  diversified as (
    -- Each extra post from the same creator is worth less, so pages stay varied.
    select s.*, s.base_score / power(row_number() over (partition by s.author_id order by s.base_score desc), 1.5) as score
    from scored s
  )
  select d.id, d.author_id, d.body, d.video_id, d.repost_of_id, d.like_count, d.repost_count, d.comment_count, d.created_at
  from diversified d
  order by d.score desc, d.created_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;

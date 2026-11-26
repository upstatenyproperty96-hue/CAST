-- Quote posts: a post with your own words on top of someone else's post (posts.repost_of_id).

-- Same rule as the "read posts" policy. A policy on posts can't query posts directly (Postgres
-- reports infinite recursion), so check through a definer function.
create or replace function public.can_view_post(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts p
    where p.id = pid
      and not public.is_blocked_by(p.author_id)
      and (p.video_id is null or exists (select 1 from public.videos v where v.id = p.video_id and public.can_view_video(v)))
  );
$$;

-- You can only quote a post you can see, and a quote must say something.
drop policy "post as self" on public.posts;
create policy "post as self" on public.posts for insert with check (
  author_id = auth.uid()
  and like_count = 0 and repost_count = 0 and comment_count = 0
  and (video_id is null or exists (select 1 from public.videos v where v.id = video_id and v.creator_id = auth.uid()))
  and (repost_of_id is null or (body <> '' and public.can_view_post(repost_of_id)))
);

-- Quoting counts as a repost for the original, and tells its author.
create or replace function public.bump_quote_counts()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  author uuid;
begin
  if tg_op = 'INSERT' then
    update public.posts set repost_count = repost_count + 1 where id = new.repost_of_id returning author_id into author;
    if author is not null and author <> new.author_id then
      insert into public.notifications (user_id, actor_id, kind, post_id) values (author, new.author_id, 'repost', new.repost_of_id);
    end if;
  else
    update public.posts set repost_count = greatest(repost_count - 1, 0) where id = old.repost_of_id;
  end if;
  return null;
end $$;
create trigger posts_quote_added after insert on public.posts
  for each row when (new.repost_of_id is not null) execute function public.bump_quote_counts();
create trigger posts_quote_removed after delete on public.posts
  for each row when (old.repost_of_id is not null) execute function public.bump_quote_counts();

create index posts_repost_of_idx on public.posts (repost_of_id) where repost_of_id is not null;
create index reactions_user_kind_idx on public.reactions (user_id, kind, created_at desc);

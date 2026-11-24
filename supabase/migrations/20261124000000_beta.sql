-- Week 4: invite-only creator beta, moderation takedowns.

-- Creators need an invite during the beta. Watching, following, and commenting stay open.
alter table public.profiles add column beta_access boolean not null default false;

create or replace function public.protect_profile_beta()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then new.beta_access := old.beta_access; end if;
  return new;
end $$;
create trigger profiles_protect_beta before update on public.profiles
  for each row execute function public.protect_profile_beta();

create table public.invite_codes (
  code text primary key check (code ~ '^[A-Z0-9]{6,20}$'),
  note text not null default '' check (char_length(note) <= 200),
  max_uses integer not null default 1 check (max_uses between 1 and 1000),
  uses integer not null default 0,
  expires_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.invite_codes enable row level security;
create policy "admins manage invites" on public.invite_codes for select using (public.is_admin());

create table public.invite_redemptions (
  code text not null references public.invite_codes (code) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (code, user_id)
);
alter table public.invite_redemptions enable row level security;
create policy "admins see redemptions" on public.invite_redemptions for select using (public.is_admin());

-- Returns true when the code worked. Uses a row lock so a code can't be over-used.
create or replace function public.redeem_invite(p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare c public.invite_codes;
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and beta_access) then return true; end if;
  select * into c from public.invite_codes where code = upper(trim(p_code)) for update;
  if not found or c.uses >= c.max_uses or (c.expires_at is not null and c.expires_at < now()) then return false; end if;
  update public.invite_codes set uses = uses + 1 where code = c.code;
  insert into public.invite_redemptions (code, user_id) values (c.code, auth.uid()) on conflict do nothing;
  update public.profiles set beta_access = true where id = auth.uid();
  return true;
end $$;
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

-- Moderation: a removed video disappears for everyone except its creator and admins.
alter table public.videos add column removed_at timestamptz;
alter table public.videos add column removed_reason text check (removed_reason is null or char_length(removed_reason) <= 500);

create or replace function public.protect_video_moderation()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.removed_at := old.removed_at;
    new.removed_reason := old.removed_reason;
  end if;
  return new;
end $$;
create trigger videos_protect_moderation before update on public.videos
  for each row execute function public.protect_video_moderation();

create or replace function public.can_view_video(v public.videos)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    v.creator_id = auth.uid()
    or public.is_admin()
    or (
      v.status = 'ready'
      and v.removed_at is null
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

create policy "admins update reports" on public.reports for update using (public.is_admin()) with check (public.is_admin());

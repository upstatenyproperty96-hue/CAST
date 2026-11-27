-- ---------------------------------------------------------------------------
-- Direct messages between two people.
-- Spam rule: you can start a conversation with someone only if they follow you.
-- Once a conversation exists, both people can keep writing, unless either one
-- blocks the other.
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- The two members, stored lowest id first so each pair has one conversation.
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index conversations_a_idx on public.conversations (user_a, last_message_at desc);
create index conversations_b_idx on public.conversations (user_b, last_message_at desc);

create table public.messages (
  id bigserial primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

-- When each member last opened the conversation, for unread counts.
create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;

create or replace function public.is_conversation_member(c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations x where x.id = c and auth.uid() in (x.user_a, x.user_b));
$$;

-- True when neither person has blocked the other.
create or replace function public.can_still_message(c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations x
    where x.id = c and auth.uid() in (x.user_a, x.user_b)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = x.user_a and b.blocked_id = x.user_b)
           or (b.blocker_id = x.user_b and b.blocked_id = x.user_a)
      )
  );
$$;

create policy "members read conversations" on public.conversations for select
  using (auth.uid() in (user_a, user_b));
-- Conversations are created only through start_conversation().

create policy "members read messages" on public.messages for select
  using (public.is_conversation_member(conversation_id));
create policy "members send messages" on public.messages for insert
  with check (sender_id = auth.uid() and public.can_still_message(conversation_id));
-- Messages can't be edited. Senders can delete their own.
create policy "senders delete own messages" on public.messages for delete
  using (sender_id = auth.uid());

create policy "read own read markers" on public.conversation_reads for select using (user_id = auth.uid());
create policy "add own read markers" on public.conversation_reads for insert
  with check (user_id = auth.uid() and public.is_conversation_member(conversation_id));
create policy "update own read markers" on public.conversation_reads for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.conversations to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant select, insert, update on public.conversation_reads to authenticated;
grant usage on sequence public.messages_id_seq to authenticated;

-- Opens (or finds) the conversation with another person. Returns null when not allowed.
create or replace function public.start_conversation(other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  lo uuid; hi uuid; cid uuid;
begin
  if me is null or other is null or other = me then return null; end if;
  lo := least(me, other); hi := greatest(me, other);
  select id into cid from public.conversations where user_a = lo and user_b = hi;
  if cid is not null then return cid; end if;
  -- New conversations: the other person must follow you, and nobody is blocked.
  if not exists (select 1 from public.follows where follower_id = other and followee_id = me) then return null; end if;
  if exists (select 1 from public.blocks b where (b.blocker_id = me and b.blocked_id = other) or (b.blocker_id = other and b.blocked_id = me)) then
    return null;
  end if;
  insert into public.conversations (user_a, user_b) values (lo, hi)
  on conflict (user_a, user_b) do update set user_a = excluded.user_a
  returning id into cid;
  return cid;
end $$;
revoke all on function public.start_conversation(uuid) from public;
grant execute on function public.start_conversation(uuid) to authenticated;

-- Keeps the inbox order fresh and limits each sender to 60 messages an hour.
create or replace function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.messages where sender_id = new.sender_id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'You are sending messages too fast. Try again later.' using errcode = 'P0001';
  end if;
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (new.conversation_id, new.sender_id, new.created_at)
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.on_message_insert();

-- Number of conversations with messages the caller hasn't read yet.
create or replace function public.unread_conversations()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.conversations c
  left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
  where auth.uid() in (c.user_a, c.user_b)
    and exists (
      select 1 from public.messages m
      where m.conversation_id = c.id and m.sender_id <> auth.uid()
        and m.created_at > coalesce(r.last_read_at, '-infinity')
    );
$$;
grant execute on function public.unread_conversations() to authenticated;

-- ---------------------------------------------------------------------------
-- Live streaming. Each creator gets one Mux live stream. They broadcast from
-- OBS, Streamlabs, or a phone app with their private stream key (never stored
-- here; the server fetches it from Mux only for its owner). When a stream ends,
-- Mux turns the recording into a normal video (the replay).
-- ---------------------------------------------------------------------------

create table public.live_streams (
  creator_id uuid primary key references public.profiles (id) on delete cascade,
  mux_live_stream_id text not null unique,
  mux_playback_id text not null,
  title text not null default '' check (char_length(title) <= 120),
  status text not null default 'idle' check (status in ('idle', 'active')),
  started_at timestamptz,
  updated_at timestamptz not null default now()
);
create index live_streams_active_idx on public.live_streams (started_at desc) where status = 'active';

alter table public.live_streams enable row level security;

-- Anyone can see who is live, except people the creator has blocked.
create policy "live streams are public" on public.live_streams for select
  using (not public.is_blocked_by(creator_id));
-- No insert/update/delete policies: only the server (service role) writes here.

-- Which video a replay came from, so replays can be labeled.
alter table public.videos add column from_live boolean not null default false;

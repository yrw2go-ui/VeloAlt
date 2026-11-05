-- 🎬 Scenes: dates and outings with a character — played out live in the chat, or just
-- described as something that already happened. Either way it becomes a shared memory.
create table if not exists chat_scenes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  kind text not null check (kind in ('live', 'past')),
  title text not null check (char_length(title) between 1 and 120),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists chat_scenes_active_idx on chat_scenes (user_id, character_id) where status = 'active';
alter table velo_messages add column if not exists scene_id uuid references chat_scenes(id) on delete set null;

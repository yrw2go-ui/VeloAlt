-- 🎭 Characters people create and chat with. Each has its own chat thread
-- (velo_messages.character_id; Velo's own chat is character_id null) and an
-- optional portrait generated with Atlas Cloud (saved to Blob as kind 'portrait').
create table if not exists chat_characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  about text not null default '' check (char_length(about) <= 1500),
  appearance text not null default '' check (char_length(appearance) <= 600),
  portrait_file_id uuid references velo_files(id) on delete set null,
  portrait_job text check (portrait_job is null or char_length(portrait_job) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_characters_user_idx on chat_characters (user_id, created_at);
alter table velo_messages add column if not exists character_id uuid references chat_characters(id) on delete cascade;
create index if not exists velo_messages_thread_idx on velo_messages (user_id, character_id, created_at desc);
alter table velo_files drop constraint if exists velo_files_kind_check;
alter table velo_files add constraint velo_files_kind_check check (kind in ('file', 'face', 'portrait'));

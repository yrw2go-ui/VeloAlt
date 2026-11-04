-- 🔊 A character's call voice can be any ElevenLabs voice (its voice_id), plus
-- whether it sounds female or male (for the device's own voice as a fallback).
alter table chat_characters drop constraint if exists chat_characters_voice_check;
alter table chat_characters add constraint chat_characters_voice_check check (char_length(voice) <= 60);
alter table chat_characters add column if not exists voice_name text not null default '' check (char_length(voice_name) <= 80);
alter table chat_characters add column if not exists voice_kind text not null default 'female' check (voice_kind in ('female', 'male'));

-- 🎨 Photos and videos Velo or a character sends in a chat or call. Made by Atlas Cloud
-- in the background, then saved to Blob; checked again and again until it's ready.
create table if not exists velo_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid references chat_characters(id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  prompt text not null check (char_length(prompt) <= 2000),
  model text not null check (char_length(model) <= 200),
  job_id text check (job_id is null or char_length(job_id) <= 200),
  status text not null default 'working' check (status in ('working', 'done', 'failed')),
  file_id uuid references velo_files(id) on delete set null,
  attempts integer not null default 0,
  error text check (error is null or char_length(error) <= 300),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists velo_media_user_idx on velo_media (user_id, status, created_at desc);
alter table velo_messages add column if not exists media_id uuid references velo_media(id) on delete set null;
alter table velo_files drop constraint if exists velo_files_kind_check;
alter table velo_files add constraint velo_files_kind_check check (kind in ('file', 'face', 'portrait', 'media'));
-- 🎬 Which video model makes their videos.
alter table users add column if not exists video_model text not null default 'wan-2.6' check (char_length(video_model) <= 40);

-- Velo — personal assistant & companion (Neon Postgres).
-- The app reaches the database only from its server routes, and every query
-- there is scoped to the signed-in person's user_id.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) <= 254),
  password_hash text not null,
  name text check (name is null or char_length(name) <= 80),
  look text not null default 'default' check (char_length(look) <= 40),
  time_zone text check (time_zone is null or char_length(time_zone) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Signed-in devices. Only a SHA-256 of each session token is stored.
create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on sessions (user_id);

-- 🧠 Long-term memory: goals, facts about their life, and short summaries of past chats and calls.
create table if not exists velo_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('goal', 'fact', 'call', 'chat')),
  text text not null check (char_length(text) between 1 and 600),
  status text not null default 'active' check (status in ('active', 'hit', 'dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  hit_at timestamptz
);
create index if not exists velo_memories_user_idx on velo_memories (user_id, kind, created_at desc);

-- ⏰ Timed reminders. The app pops them up when due, then marks them sent / dismissed.
create table if not exists velo_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  remind_at timestamptz not null,
  time_zone text not null check (char_length(time_zone) between 1 and 64),
  status text not null default 'pending' check (status in ('pending', 'sent', 'dismissed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists velo_reminders_user_idx on velo_reminders (user_id, status, remind_at);

-- ✅ To-do list.
create table if not exists velo_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists velo_tasks_user_idx on velo_tasks (user_id, done, created_at desc);

-- 💬 The chat with Velo, so it follows them across devices.
create table if not exists velo_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  created_at timestamptz not null default now()
);
create index if not exists velo_messages_user_idx on velo_messages (user_id, created_at desc);
-- Velo Pro: subscription, the owner's verified phone, contacts, and actions
-- (texts and calls Velo makes for them — each one approved first).
alter table users
  add column if not exists plan text not null default 'free' check (plan in ('free', 'pro')),
  add column if not exists stripe_customer_id text,
  add column if not exists subscription_status text,
  add column if not exists phone text check (phone is null or phone ~ '^\+1[2-9][0-9]{9}$'),
  add column if not exists phone_verified_at timestamptz,
  add column if not exists phone_code_hash text,
  add column if not exists phone_code_expires timestamptz,
  add column if not exists phone_code_tries int not null default 0;
-- A verified number belongs to one account (it's how Velo knows who's texting or calling her).
create unique index if not exists users_verified_phone_idx on users (phone) where phone_verified_at is not null;
create index if not exists users_stripe_customer_idx on users (stripe_customer_id);

create table if not exists velo_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  phone text not null check (phone ~ '^\+1[2-9][0-9]{9}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists velo_contacts_name_idx on velo_contacts (user_id, lower(name));

-- kind: 'text' / 'call' (Velo reaching someone for them, approved first) or
-- 'inbound' (the owner calling Velo's number; holds the call's transcript).
create table if not exists velo_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('text', 'call', 'inbound')),
  to_name text check (to_name is null or char_length(to_name) <= 80),
  to_phone text,
  body text not null default '' check (char_length(body) <= 1600),
  status text not null default 'pending' check (status in ('pending', 'approved', 'calling', 'done', 'failed', 'cancelled')),
  result text check (result is null or char_length(result) <= 2000),
  transcript jsonb not null default '[]',
  twilio_sid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists velo_actions_user_idx on velo_actions (user_id, created_at desc);
create index if not exists velo_actions_sid_idx on velo_actions (twilio_sid);
-- Social posting (Velo Pro): a connected Facebook Page per person, and
-- 'post' actions (drafted by Velo, published only when approved).
create table if not exists social_accounts (
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('facebook')),
  page_id text,
  page_name text check (page_name is null or char_length(page_name) <= 200),
  page_token text,          -- AES-256-GCM sealed (app/lib/fbCrypto.ts), never sent to the browser
  pending_pages text,       -- sealed list while they pick one of several Pages
  pending_until timestamptz,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table velo_actions drop constraint if exists velo_actions_kind_check;
alter table velo_actions add constraint velo_actions_kind_check check (kind in ('text', 'call', 'inbound', 'post'));
-- 🛒 Amazon carts Velo puts together (Velo Pro). Nothing is bought: the card
-- opens the cart on Amazon and the person checks out there themselves.
alter table velo_actions drop constraint if exists velo_actions_kind_check;
alter table velo_actions add constraint velo_actions_kind_check check (kind in ('text', 'call', 'inbound', 'post', 'cart'));
-- 🧠 Which AI each person chats with (Settings → Velo's brain).
alter table users add column if not exists chat_model text not null default 'claude' check (chat_model in ('claude', 'qwen', 'deepseek'));
-- 💬 Velo's personality per person; romantic needs the adult confirmation first.
alter table users
  add column if not exists personality text not null default 'friend' check (personality in ('friend', 'professional', 'sarcastic', 'romantic')),
  add column if not exists adult_confirmed_at timestamptz;
-- 📎 Files saved to Vercel Blob: chat attachments (kind 'file') and Velo's
-- custom face (kind 'face'). Each person sees and deletes only their own.
create table if not exists velo_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null default 'file' check (kind in ('file', 'face')),
  url text not null check (char_length(url) <= 1000),
  pathname text not null check (char_length(pathname) <= 600),
  name text not null check (char_length(name) between 1 and 200),
  content_type text not null check (char_length(content_type) <= 100),
  size integer not null check (size >= 0),
  created_at timestamptz not null default now()
);
create index if not exists velo_files_user_idx on velo_files (user_id, kind, created_at desc);
-- A chat message can carry one attachment.
alter table velo_messages add column if not exists file_id uuid references velo_files(id) on delete set null;
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
-- 🎭 Characters are made by admins and shared with everyone. Each has a
-- personality, backstory, relation to the person, and a call voice.
-- 🧠 Memories are kept per person AND per character (Velo's own: character_id null),
-- so nothing crosses between Velo and characters, or between characters.
alter table users add column if not exists is_admin boolean not null default false;

do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'chat_characters' and column_name = 'user_id') then
    alter table chat_characters drop constraint if exists chat_characters_user_id_fkey;
    alter table chat_characters rename column user_id to created_by;
    alter table chat_characters alter column created_by drop not null;
    alter table chat_characters add constraint chat_characters_created_by_fkey foreign key (created_by) references users(id) on delete set null;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'chat_characters' and column_name = 'about') then
    alter table chat_characters rename column about to personality;
  end if;
end $$;
alter table chat_characters drop constraint if exists chat_characters_about_check;
alter table chat_characters drop constraint if exists chat_characters_personality_check;
alter table chat_characters add constraint chat_characters_personality_check check (char_length(personality) <= 2000);
alter table chat_characters add column if not exists backstory text not null default '' check (char_length(backstory) <= 3000);
alter table chat_characters add column if not exists relation text not null default '' check (char_length(relation) <= 600);
alter table chat_characters add column if not exists voice text not null default 'sarah' check (char_length(voice) <= 40);
drop index if exists chat_characters_user_idx;
create index if not exists chat_characters_created_idx on chat_characters (created_at);

alter table velo_memories add column if not exists character_id uuid references chat_characters(id) on delete cascade;
create index if not exists velo_memories_thread_idx on velo_memories (user_id, character_id, kind, created_at desc);
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
-- 💕 A character can be romantic (PG-13, adults only). 🖼️ 2–4 reference images
-- (from its gallery) keep it looking the same in every photo and video.
alter table chat_characters add column if not exists romantic boolean not null default false;
alter table chat_characters add column if not exists reference_ids uuid[] not null default '{}' check (cardinality(reference_ids) <= 4);
-- Gallery: every photo/video gets a small thumbnail, can be kept (⭐), and says something when it arrives.
alter table velo_media add column if not exists thumb_file_id uuid references velo_files(id) on delete set null;
alter table velo_media add column if not exists poster_url text check (poster_url is null or char_length(poster_url) <= 1000);
alter table velo_media add column if not exists kept boolean not null default false;
alter table velo_media add column if not exists caption text check (caption is null or char_length(caption) <= 200);
create index if not exists velo_media_gallery_idx on velo_media (user_id, character_id, created_at desc) where status = 'done';
-- 🖼️ A small thumbnail for each uploaded photo (the chat shows it; the full photo opens on tap).
alter table velo_files add column if not exists thumb_url text check (thumb_url is null or char_length(thumb_url) <= 1000);

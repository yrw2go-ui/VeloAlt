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
-- ❤️ Their reaction to a photo/video Velo or a character sent (one at a time; tap again to remove).
alter table velo_media add column if not exists reaction text check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍'));
-- 💕 Romance arc (romantic characters only): how the character's feelings start and can grow,
-- written by the admin. Each person's relationship then develops on its own: how the
-- character feels about THEM right now, updated slowly after chats and calls.
alter table chat_characters add column if not exists romance_arc text not null default '' check (char_length(romance_arc) <= 1500);
create table if not exists chat_relationships (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  feelings text not null check (char_length(feelings) <= 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, character_id)
);
-- 👤 "About you" (all optional): how they describe themselves, a photo (described once in
-- words so Velo and characters know their look), birthday or age, and the US state they live in.
alter table users add column if not exists bio text check (bio is null or char_length(bio) <= 1000);
alter table users add column if not exists bio_photo_file_id uuid references velo_files(id) on delete set null;
alter table users add column if not exists bio_photo_note text check (bio_photo_note is null or char_length(bio_photo_note) <= 600);
alter table users add column if not exists birthday date;
alter table users add column if not exists age integer check (age is null or age between 13 and 120);
alter table users add column if not exists home_state text check (home_state is null or char_length(home_state) <= 40);
alter table velo_files drop constraint if exists velo_files_kind_check;
alter table velo_files add constraint velo_files_kind_check check (kind in ('file', 'face', 'portrait', 'media', 'bio'));
-- 🎚️ A character's own time zone, temperament sliders (0–10) and the preset they started from.
alter table chat_characters add column if not exists time_zone text not null default '' check (char_length(time_zone) <= 64);
alter table chat_characters add column if not exists traits jsonb not null default '{}';
alter table chat_characters add column if not exists preset text not null default '' check (char_length(preset) <= 40);
-- 🎂 A character's own birthday (month-day).
alter table chat_characters add column if not exists birthday text not null default '' check (birthday = '' or birthday ~ '^[01][0-9]-[0-3][0-9]$');
-- 📸 Photos/videos Velo or a character OFFERS on their own wait for the person's OK before anything is made.
alter table velo_media drop constraint if exists velo_media_status_check;
alter table velo_media add constraint velo_media_status_check check (status in ('offered', 'declined', 'working', 'done', 'failed'));
alter table velo_media add column if not exists description text check (description is null or char_length(description) <= 400);
alter table velo_media add column if not exists refs text[] not null default '{}';
-- 👥 Who has heard of whom: when someone mentions character B while talking to A (or to Velo,
-- knower_id null), A slowly learns a little about B — from B's character sheet only, never
-- from what they told B.
create table if not exists chat_acquaintances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  knower_id uuid references chat_characters(id) on delete cascade,
  known_id uuid not null references chat_characters(id) on delete cascade,
  mentions integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create unique index if not exists chat_acquaintances_pair on chat_acquaintances (user_id, coalesce(knower_id, '00000000-0000-0000-0000-000000000000'::uuid), known_id);
-- 😮 Reactions on any chat message: theirs on Velo's/a character's messages (reaction), and
-- Velo's/the character's on theirs (their_reaction). Shocked joins the set (photos/videos too).
alter table velo_messages add column if not exists reaction text check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮'));
alter table velo_messages add column if not exists their_reaction text check (their_reaction is null or their_reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮'));
alter table velo_media drop constraint if exists velo_media_reaction_check;
alter table velo_media add constraint velo_media_reaction_check check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮'));
-- 🔔 Check-ins: Velo and characters can text them first, with a push notification.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);
alter table users add column if not exists checkins text not null default 'sometimes' check (checkins in ('off', 'sometimes', 'often'));
create table if not exists chat_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid references chat_characters(id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index if not exists chat_checkins_user_idx on chat_checkins (user_id, sent_at desc);
-- App-wide settings the server makes for itself (e.g. its push keys), never shown to anyone.
create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now()
);
-- 🤝 Trust: how much a character trusts this person right now (0–100), moving a little
-- after each chat or call. Kept with the relationship (feelings may be empty if not romantic).
alter table chat_relationships alter column feelings drop not null;
alter table chat_relationships add column if not exists trust integer check (trust is null or trust between 0 and 100);
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
-- 🔴 Unread badges: when they last looked at each chat (Velo's: character_id null).
create table if not exists chat_reads (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid references chat_characters(id) on delete cascade,
  read_at timestamptz not null default now()
);
create unique index if not exists chat_reads_pair on chat_reads (user_id, coalesce(character_id, '00000000-0000-0000-0000-000000000000'::uuid));
-- Everything before now counts as already read.
insert into chat_reads (user_id, character_id, read_at)
  select distinct user_id, character_id, now() from velo_messages
  on conflict do nothing;

-- 😂 Laughing joins the reactions (messages, their reactions, photos/videos).
alter table velo_messages drop constraint if exists velo_messages_reaction_check;
alter table velo_messages add constraint velo_messages_reaction_check check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂'));
alter table velo_messages drop constraint if exists velo_messages_their_reaction_check;
alter table velo_messages add constraint velo_messages_their_reaction_check check (their_reaction is null or their_reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂'));
alter table velo_media drop constraint if exists velo_media_reaction_check;
alter table velo_media add constraint velo_media_reaction_check check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂'));

-- 📅 Plans: a hangout or date a character and the person agreed on for a day. On that day the
-- chat (and a push, if they're on) asks them to set the scene so it can be played out.
create table if not exists chat_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  details text not null default '' check (char_length(details) <= 600),
  day date not null,
  status text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chat_plans_due_idx on chat_plans (user_id, day) where status = 'planned';

-- 💼 A character's everyday life: their job, the casual clothes they usually wear, and favorite hobbies.
alter table chat_characters add column if not exists job text not null default '' check (char_length(job) <= 300);
alter table chat_characters add column if not exists casual_wear text not null default '' check (char_length(casual_wear) <= 400);
alter table chat_characters add column if not exists hobbies text not null default '' check (char_length(hobbies) <= 600);

-- ⏰ Texts a character promised to send at a set time ("text me at 8"), delivered as a chat
-- message plus a push notification when the time comes.
create table if not exists chat_promises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  due_at timestamptz not null,
  about text not null check (char_length(about) between 1 and 300),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists chat_promises_due_idx on chat_promises (due_at) where status = 'pending';

-- 👀 Scene peeks: a photo of the scene as if they were there. She never knows — peek messages
-- and pictures are left out of everything the character reads.
alter table velo_messages add column if not exists peek boolean not null default false;
alter table velo_media add column if not exists peek boolean not null default false;

-- 🔁 A photo/video that the picture service failed (or took too long on) is started again once.
alter table velo_media add column if not exists retried boolean not null default false;

-- 💬 How long Velo's and the characters' replies usually are (their setting).
alter table users add column if not exists reply_length text not null default 'normal' check (reply_length in ('short', 'normal', 'long'));
-- 👭 Characters who know each other firsthand: friends or family (set in the character editor).
-- Stored once per pair (a_id < b_id). "@Name" in a backstory also links them (read live, not stored).
create table if not exists chat_character_links (
  a_id uuid not null references chat_characters(id) on delete cascade,
  b_id uuid not null references chat_characters(id) on delete cascade,
  kind text not null default 'friends' check (char_length(kind) between 1 and 60),
  story text not null default '' check (char_length(story) <= 600),
  created_at timestamptz not null default now(),
  primary key (a_id, b_id),
  check (a_id < b_id)
);
-- 👭 Links go one way: knower_id knows known_id. A link from both sides means they know each other.
-- Existing links were mutual, so each becomes two one-way links.
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'chat_character_links' and column_name = 'a_id') then
    alter table chat_character_links rename column a_id to knower_id;
    alter table chat_character_links rename column b_id to known_id;
    alter table chat_character_links drop constraint if exists chat_character_links_check;
    insert into chat_character_links (knower_id, known_id, kind, story, created_at)
      select known_id, knower_id, kind, story, created_at from chat_character_links on conflict do nothing;
  end if;
end $$;
alter table chat_character_links drop constraint if exists chat_character_links_not_self;
alter table chat_character_links add constraint chat_character_links_not_self check (knower_id <> known_id);
-- 👥 Group chats: the person and 2–6 characters in one thread. Each character replies as herself
-- and keeps her own memory of it. Kept apart from one-on-one chats.
create table if not exists chat_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 60),
  member_ids uuid[] not null check (cardinality(member_ids) between 2 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_groups_user on chat_groups (user_id, updated_at desc);
create table if not exists chat_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references chat_groups(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  speaker_id uuid references chat_characters(id) on delete cascade, -- null: the person
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);
create index if not exists chat_group_messages_group on chat_group_messages (group_id, created_at);
-- 🤝 Characters who met in this person's group chats: they start as acquaintances and grow closer
-- the more they chat together (per person; both know each other). One row per pair (a_id < b_id).
create table if not exists chat_bonds (
  user_id uuid not null references users(id) on delete cascade,
  a_id uuid not null references chat_characters(id) on delete cascade,
  b_id uuid not null references chat_characters(id) on delete cascade,
  story text not null default '' check (char_length(story) <= 600),
  messages int not null default 0,
  occasions int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (user_id, a_id, b_id),
  check (a_id < b_id)
);
-- 🎬 A scene played out in a group chat, and 👀 peeks at it (one or more of the characters).
alter table chat_groups add column if not exists scene_title text check (scene_title is null or char_length(scene_title) <= 120);
alter table chat_groups add column if not exists scene_details text check (scene_details is null or char_length(scene_details) <= 1000);
alter table chat_group_messages add column if not exists media_id uuid references velo_media(id) on delete set null;
alter table chat_group_messages add column if not exists peek boolean not null default false;
-- 🧠 A character's own brain: Qwen or DeepSeek through Atlas Cloud handles everything for her ('' = the person's choice in Settings).
alter table chat_characters add column if not exists brain text not null default '' check (brain in ('', 'qwen', 'deepseek'));
-- 💬 Characters chatting among themselves in a group: after every 5–10 of the person's messages, a few lines between them.
alter table chat_groups add column if not exists since_banter int not null default 0;
alter table chat_groups add column if not exists banter_at int not null default 7;
alter table chat_groups add column if not exists banter_left int not null default 0;
-- 👤 More sections in "About you" (work, hobbies, favorites, family & pets, goals…), all optional.
alter table users add column if not exists bio_more jsonb not null default '{}';
-- 📸 In-the-moment photos from characters: counts chat exchanges since her last photo, and when the next offer is due.
alter table chat_relationships add column if not exists pic_count int not null default 0;
alter table chat_relationships add column if not exists pic_at int;
-- 🥵 🤤 😏 😅 join the reactions; reactions in group chats (theirs on a character's message, and the characters' on theirs).
alter table velo_messages drop constraint if exists velo_messages_reaction_check;
alter table velo_messages add constraint velo_messages_reaction_check check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂', '🥵', '🤤', '😏', '😅'));
alter table velo_messages drop constraint if exists velo_messages_their_reaction_check;
alter table velo_messages add constraint velo_messages_their_reaction_check check (their_reaction is null or their_reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂', '🥵', '🤤', '😏', '😅'));
alter table velo_media drop constraint if exists velo_media_reaction_check;
alter table velo_media add constraint velo_media_reaction_check check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂', '🥵', '🤤', '😏', '😅'));
alter table chat_group_messages add column if not exists reaction text;
alter table chat_group_messages drop constraint if exists chat_group_messages_reaction_check;
alter table chat_group_messages add constraint chat_group_messages_reaction_check check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂', '🥵', '🤤', '😏', '😅'));
alter table chat_group_messages add column if not exists their_reactions jsonb not null default '{}';
-- 💼 A character's work: attire, days (0 = Sunday … 6 = Saturday), hours (HH:MM, her own time zone), part-time.
-- 💞 Romance options: open to polyamory (possible, not guaranteed); 🌈 "kinda lesbian leaning" (men stay primary).
alter table chat_characters add column if not exists work_attire text not null default '' check (char_length(work_attire) <= 400);
alter table chat_characters add column if not exists work_days int[] not null default '{}';
alter table chat_characters add column if not exists work_start text not null default '' check (work_start = '' or work_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table chat_characters add column if not exists work_end text not null default '' check (work_end = '' or work_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table chat_characters add column if not exists part_time boolean not null default false;
alter table chat_characters add column if not exists poly_ok boolean not null default false;
alter table chat_characters add column if not exists sapphic boolean not null default false;
-- 🕒 A scene's clock: on real time ('now') or its own scheduled time ('set', moving forward from set_time as it's played).
-- planned_time is the plan's time, so she knows when a scene got pushed back. Plans can keep a time of day too.
alter table chat_plans add column if not exists at_time text not null default '' check (at_time = '' or at_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table chat_scenes add column if not exists clock text not null default 'now' check (clock in ('now', 'set'));
alter table chat_scenes add column if not exists set_time text not null default '' check (set_time = '' or set_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table chat_scenes add column if not exists planned_time text not null default '' check (planned_time = '' or planned_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table chat_groups add column if not exists scene_clock text not null default 'now' check (scene_clock in ('now', 'set'));
alter table chat_groups add column if not exists scene_set_time text not null default '';
alter table chat_groups add column if not exists scene_started_at timestamptz;
alter table chat_scenes add column if not exists pushed boolean not null default false;
-- 🧠 More brains per character: Claude (always Claude), Qwen (fast), Qwen (big), DeepSeek ('' = same as Velo).
alter table chat_characters drop constraint if exists chat_characters_brain_check;
alter table chat_characters add constraint chat_characters_brain_check check (brain in ('', 'claude', 'qwen', 'qwen2', 'deepseek'));
-- 🔗 The Qwen chain: Qwen (fast), then Qwen (big), then Claude.
alter table chat_characters drop constraint if exists chat_characters_brain_check;
alter table chat_characters add constraint chat_characters_brain_check check (brain in ('', 'claude', 'qwen', 'qwen2', 'deepseek', 'qwen-chain'));
-- 📸 A photo/video that fails or stalls at the picture service is retried up to 3 times.
alter table velo_media add column if not exists retries int not null default 0;
-- 👋 Introductions: a character introduces someone of hers (always a new woman), made just for this person.
-- Their own characters (owner_id) stay private to them; hidden until they accept the introduction.
alter table chat_characters add column if not exists owner_id uuid references users(id) on delete cascade;
alter table chat_characters add column if not exists intro_status text check (intro_status is null or intro_status in ('pending', 'accepted'));
create table if not exists chat_intros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  introducer_id uuid not null references chat_characters(id) on delete cascade,
  character_id uuid references chat_characters(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  age int,
  status text not null default 'making' check (status in ('making', 'portrait', 'ready', 'accepted', 'declined', 'failed')),
  created_at timestamptz not null default now()
);
create index if not exists chat_intros_user on chat_intros (user_id, status);
alter table chat_relationships add column if not exists intro_count int not null default 0;
alter table chat_relationships add column if not exists intro_at int;
-- How two characters are related for this person (e.g. sisters, from an introduction); '' = they met in a group chat.
alter table chat_bonds add column if not exists kind text not null default '';
-- 😴 joins the reactions.
alter table velo_messages drop constraint if exists velo_messages_reaction_check;
alter table velo_messages add constraint velo_messages_reaction_check check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂', '🥵', '🤤', '😏', '😅', '😴'));
alter table velo_messages drop constraint if exists velo_messages_their_reaction_check;
alter table velo_messages add constraint velo_messages_their_reaction_check check (their_reaction is null or their_reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂', '🥵', '🤤', '😏', '😅', '😴'));
alter table velo_media drop constraint if exists velo_media_reaction_check;
alter table velo_media add constraint velo_media_reaction_check check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂', '🥵', '🤤', '😏', '😅', '😴'));
alter table chat_group_messages drop constraint if exists chat_group_messages_reaction_check;
alter table chat_group_messages add constraint chat_group_messages_reaction_check check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂', '🥵', '🤤', '😏', '😅', '😴'));
alter table velo_media add column if not exists resend_at timestamptz;
alter table velo_media add column if not exists resent boolean not null default false;
create index if not exists velo_media_resend on velo_media (resend_at) where resend_at is not null;
alter table velo_media add column if not exists subject text;
create table if not exists chat_in_person (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  place text not null default '',
  started_at timestamptz not null default now(),
  primary key (user_id, character_id)
);
alter table chat_groups add column if not exists in_person_place text check (in_person_place is null or char_length(in_person_place) <= 120);
alter table chat_groups add column if not exists catch_up jsonb not null default '{}'::jsonb;
alter table chat_group_messages add column if not exists private_to uuid references chat_characters(id) on delete cascade;
alter table chat_characters add column if not exists big_following boolean not null default false;
alter table velo_media add column if not exists pica boolean not null default false;
create table if not exists pica_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  author_id uuid references chat_characters(id) on delete cascade, -- null: the person
  kind text not null check (kind in ('image', 'text')),
  caption text not null default '' check (char_length(caption) <= 2200),
  photo text not null default '' check (char_length(photo) <= 1500),
  media_id uuid references velo_media(id) on delete set null,
  likes_target int not null default 0,
  liked boolean not null default false,
  liked_by text[] not null default '{}',
  place text not null default '',
  seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pica_posts_feed on pica_posts (user_id, created_at desc);
create table if not exists pica_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references pica_posts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  author_id uuid references chat_characters(id) on delete cascade, -- a character they know
  mine boolean not null default false,                               -- the person
  name text not null default '',                                     -- a stranger's username
  text text not null check (char_length(text) between 1 and 600),
  created_at timestamptz not null default now()
);
create index if not exists pica_comments_post on pica_comments (post_id, created_at);
create table if not exists pica_days (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
create table if not exists chat_away (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  place text not null default '',
  until date not null,
  primary key (user_id, character_id)
);
alter table users add column if not exists pica_looked_at timestamptz;
create table if not exists pica_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  handle text not null check (char_length(handle) between 2 and 30),
  name text not null check (char_length(name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 300),
  look text not null default '' check (char_length(look) <= 600),
  followers int not null default 1000,
  followed boolean not null default false,
  avatar_media_id uuid references velo_media(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pica_accounts_user on pica_accounts (user_id);
alter table pica_posts add column if not exists account_id uuid references pica_accounts(id) on delete cascade;
create table if not exists pica_saved (
  user_id uuid not null references users(id) on delete cascade,
  media_id uuid not null references velo_media(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, media_id)
);
alter table pica_accounts add column if not exists character_id uuid references chat_characters(id) on delete set null;
alter table pica_posts add column if not exists liker_secs int[] not null default '{}';
alter table chat_characters drop constraint if exists chat_characters_brain_check;
alter table chat_characters add constraint chat_characters_brain_check check (brain in ('', 'claude', 'qwen', 'qwen2', 'deepseek', 'kimi', 'qwen-chain'));
alter table users drop constraint if exists users_chat_model_check;
alter table users add constraint users_chat_model_check check (chat_model in ('claude', 'qwen', 'deepseek', 'kimi'));
create table if not exists pica_dms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references pica_accounts(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '' check (char_length(content) <= 4000),
  media_id uuid references velo_media(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pica_dms_thread on pica_dms (user_id, account_id, created_at desc);
alter table pica_accounts add column if not exists brain text not null default '' check (brain in ('', 'claude', 'qwen', 'qwen2', 'deepseek', 'kimi', 'qwen-chain'));
create table if not exists pica_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references pica_accounts(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 600),
  created_at timestamptz not null default now()
);
create index if not exists pica_memories_acc on pica_memories (user_id, account_id, created_at);
alter table users add column if not exists bio_photo_notes jsonb not null default '{}'::jsonb;
-- 💞🤫 Where a romance stands: '' as before, 'gf' officially together (everyone knows),
-- 'secret' together but keeping it private in front of others.
alter table chat_characters add column if not exists standing text not null default '' check (standing in ('', 'gf', 'secret'));
-- Who has worked out a secret relationship: a character who got close enough to find out.
create table if not exists chat_secret_out (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade, -- the one in the secret relationship
  knower_id uuid not null references chat_characters(id) on delete cascade,    -- the one who found out
  at timestamptz not null default now(),
  primary key (user_id, character_id, knower_id)
);
-- 💞🤫 Both can be true at once: his girlfriend, and nobody knows.
alter table chat_characters drop constraint if exists chat_characters_standing_check;
alter table chat_characters add constraint chat_characters_standing_check check (standing in ('', 'gf', 'secret', 'gf+secret'));
-- 😊 How happy she is with them right now (0–100): it grows with attention and good chats, and
-- slips when she's left alone. The happier she is, the more she takes in her stride.
alter table chat_relationships add column if not exists happy integer check (happy is null or happy between 0 and 100);
-- 💗 How much a romantic character loves them (0–100): it starts from her nature and grows or
-- cools over time, with everything that happens between them.
alter table chat_relationships add column if not exists love integer check (love is null or love between 0 and 100);
-- 🤒 chat_away also covers being off colour: 'trip' (away, the default) or 'sick' (at home, run down).
alter table chat_away add column if not exists kind text not null default 'trip' check (kind in ('trip', 'sick'));
-- 🙅‍♀️💬 What she last turned down, so that asking again (sweetly) can win her round.
create table if not exists chat_turndowns (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  ask text not null check (ask in ('scene', 'person', 'call')),
  at timestamptz not null default now(),
  primary key (user_id, character_id, ask)
);
-- 🏠 The town or city they live in (with the state): new characters and Picagram women mostly live near it.
alter table users add column if not exists home_town text check (home_town is null or char_length(home_town) <= 80);
alter table pica_accounts add column if not exists lives text check (lives is null or char_length(lives) <= 120);
-- 🙈 A day she called off work or skipped class (so the app doesn't say she's there).
create table if not exists chat_off (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  day date not null,
  primary key (user_id, character_id, day)
);
-- 🎓 Her class timetable, alongside her work week: which days, what hours, and where she studies.
alter table chat_characters add column if not exists class_days int[] not null default '{}';
alter table chat_characters add column if not exists class_start text not null default '' check (char_length(class_start) <= 5);
alter table chat_characters add column if not exists class_end text not null default '' check (char_length(class_end) <= 5);
alter table chat_characters add column if not exists school text not null default '' check (char_length(school) <= 200);
-- 🏡 Time off at home (a staycation) alongside a trip away or a sick spell.
alter table chat_away drop constraint if exists chat_away_kind_check;
alter table chat_away add constraint chat_away_kind_check check (kind in ('trip', 'sick', 'stay'));
-- 👩 Accounts you made yourself: your specs, your pictures. Her new photos are built from those
-- references (a headshot and a full shot) instead of the first picture the app happened to make.
alter table pica_accounts add column if not exists mine boolean not null default false;
alter table pica_accounts add column if not exists ref_media_ids uuid[] not null default '{}';
-- 👤 Your own Picagram profile: a bio and a picture of you that's yours to change.
alter table users add column if not exists pica_bio text not null default '' check (char_length(pica_bio) <= 300);
alter table users add column if not exists pica_avatar_file_id uuid references velo_files(id) on delete set null;
-- 🙈 Characters you'd rather not see on Picagram. Nothing she can notice — unlike unfollowing her.
alter table chat_characters add column if not exists pica_hidden boolean not null default false;
alter table velo_files drop constraint if exists velo_files_kind_check;
alter table velo_files add constraint velo_files_kind_check check (kind in ('file', 'face', 'portrait', 'media', 'bio', 'picame'));
-- 💔 Something hurt her. She goes a bit quiet for a while — at most 48 hours, and sooner if
-- he puts it right. One sore spot at a time per person; a new one replaces the old.
create table if not exists chat_sore (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  why text not null default '' check (char_length(why) <= 300),
  level int not null default 1 check (level between 1 and 3),
  since timestamptz not null default now(),
  until timestamptz not null,
  primary key (user_id, character_id)
);
-- 🏠 She lives with you. When she's home you're in the same house, not texting.
alter table chat_characters add column if not exists live_in boolean not null default false;
-- 📍 She lives within about an hour — close enough to actually see on a weeknight.
alter table chat_characters add column if not exists local boolean not null default false;
-- 💍 Where her heart is besides you.
--   status: single | dating (seeing someone, short-term) | married
--   sees_others: she may start something short-term of her own (weeks to months, never longer)
--   lesbian: into women; she flirts with other women more than with you until you win her round
alter table chat_characters add column if not exists attached text not null default 'single'
  check (attached in ('single', 'dating', 'married'));
alter table chat_characters add column if not exists sees_others boolean not null default false;
alter table chat_characters add column if not exists lesbian boolean not null default false;
-- Who she's with, and until when (a short-term thing of her own; married has no end date).
alter table chat_characters add column if not exists partner text not null default '' check (char_length(partner) <= 120);
alter table chat_characters add column if not exists attached_since date;
alter table chat_characters add column if not exists attached_until date;
-- ⚢ How she is while she's into women: the same woman, a little different with you and with men.
-- Written alongside her usual personality and used only while the tick is on.
alter table chat_characters add column if not exists lesbian_personality text not null default ''
  check (char_length(lesbian_personality) <= 2000);
-- ⚢ And on a Picagram woman, so she's already herself when you befriend her.
alter table pica_accounts add column if not exists lesbian boolean not null default false;
-- 😀 The six added to the bar (👀 👌 🤔 🫣 💦 😈) were allowed in the app but not by the database,
-- so picking one on a photo or a message was refused. Every reaction column now takes all eighteen.
do $$
declare t text; c text;
begin
  for t, c in values ('velo_messages', 'reaction'), ('velo_messages', 'their_reaction'),
                     ('velo_media', 'reaction'), ('chat_group_messages', 'reaction') loop
    execute format('alter table %I drop constraint if exists %I', t, t || '_' || c || '_check');
    execute format($f$alter table %I add constraint %I check (%I is null or %I in
      ('❤️','🔥','🙌','😍','👍','😮','😂','🥵','🤤','💦','😈','😏','👀','👌','🤔','🫣','😅','😴'))$f$,
      t, t || '_' || c || '_check', c, c);
  end loop;
end $$;
-- ↻ Redo: a new picture made to take an old one's place. The link is kept on the new row so the
-- swap happens when it's actually ready — and the old one is deleted outright, not left behind.
alter table velo_media add column if not exists replaces uuid references velo_media(id) on delete set null;
-- 🏘️ Neighbours: she lives a few doors down, knows it, and can stop by when you're home.
alter table chat_characters add column if not exists neighbor boolean not null default false;
-- 🏠 Whether you're home right now (yours, not hers — one switch for the whole street).
alter table users add column if not exists at_home boolean not null default false;
alter table users add column if not exists at_home_at timestamptz;
-- 🔔 Someone at the door, or asking you over. Nothing happens to how she feels either way.
create table if not exists chat_dropins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  kind text not null check (kind in ('door', 'over')),
  line text not null check (char_length(line) <= 300),
  status text not null default 'waiting' check (status in ('waiting', 'answered', 'ignored')),
  created_at timestamptz not null default now()
);
create index if not exists chat_dropins_user on chat_dropins (user_id, created_at desc);
-- 🤫 A secret one comes round the back, and the door can be answered with someone already here.
alter table chat_dropins drop constraint if exists chat_dropins_kind_check;
alter table chat_dropins add constraint chat_dropins_kind_check check (kind in ('door', 'back', 'over'));
-- 🏡 Ordinary people on Picagram: which of the six this account is (so each turns up once).
alter table pica_accounts add column if not exists folk text check (folk is null or char_length(folk) <= 40);
-- 🎭 Picagram people get a personality of their own: a description and the nine sliders,
-- yours to edit, and they go with her if you befriend her.
alter table pica_accounts add column if not exists personality text check (personality is null or char_length(personality) <= 2000);
alter table pica_accounts add column if not exists traits jsonb not null default '{}'::jsonb;
-- 📍 Where she lives NOW, said plainly, instead of being guessed from her backstory. A card can
-- say she grew up in Arizona and works in Chicago; only this field says where she is today.
alter table chat_characters add column if not exists lives_in text not null default '' check (char_length(lives_in) <= 120);
-- 📝 Settings → Photo wording: their own version of the standing wording on every picture.
-- Only the lines they actually changed are kept, so a reworded default still reaches them.
alter table users add column if not exists prompt_words jsonb not null default '{}'::jsonb;
-- 🛠️ Settings → Admin → Messaging & wording: their own version of the lines that shape how a
-- character talks. Only the lines they actually changed are kept.
alter table users add column if not exists talk_words jsonb not null default '{}'::jsonb;
-- 💗 She was into women only, and then there was them: once she's properly fallen for this one
-- person, she's bisexual from then on — still drawn to women, and drawn to them. Per person, so
-- a character everyone shares isn't changed for everybody by one person winning her over.
alter table chat_relationships add column if not exists won_over timestamptz;
-- 🏳️‍🌈 On her own card (only a character of theirs), the ⚢ tick comes off and this remembers why.
alter table chat_characters add column if not exists was_lesbian boolean not null default false;
-- 📅 A plan is either 🎥 a video chat or 🧍 seeing each other in person. Older plans stay as the
-- video chat they'd have been.
alter table chat_plans add column if not exists kind text not null default 'video' check (kind in ('video', 'person'));
-- 🔔 The pop-up that asks to start it at the agreed time fires once.
alter table chat_plans add column if not exists started_at timestamptz;
-- 🚗 You invited her over and you're not marked home: she says she's on her way, and then that
-- she's here and wondering where you are. Each happens once per plan.
alter table chat_plans add column if not exists on_way_at timestamptz;
alter table chat_plans add column if not exists arrived_at timestamptz;
-- 💑 The person a character is seeing who isn't a character of their own: their look, kept
-- so every picture of them has the same face. When the character moves on to someone else
-- (or it ends), the row goes with it and the next one starts from scratch.
create table if not exists chat_partner_looks (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  name text not null default '',
  look text not null default '',
  refs text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, character_id)
);
-- 📍 Local characters asking you over, or out somewhere: one a day at most, and not the same
-- person again for days. Kept so it stays occasional.
create table if not exists chat_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  kind text not null check (kind in ('mine', 'yours', 'out')),
  created_at timestamptz not null default now()
);
create index if not exists chat_invites_user on chat_invites (user_id, created_at desc);
-- 🗣️ People you've named to a character in a chat who aren't characters themselves — the women on
-- your Picagram. She knows OF them from you: she's never met them, she can ask about them, and
-- she can look them up on Picagram. (Velo's own row has no knower, like chat_acquaintances.)
create table if not exists chat_known_accounts (
  user_id uuid not null references users(id) on delete cascade,
  knower_id uuid references chat_characters(id) on delete cascade,
  account_id uuid not null references pica_accounts(id) on delete cascade,
  mentions int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create unique index if not exists chat_known_accounts_one
  on chat_known_accounts (user_id, coalesce(knower_id, '00000000-0000-0000-0000-000000000000'::uuid), account_id);
-- 🏠 Whose place you're at while you're together: yours, or theirs. A knock at your door can't be
-- answered when you're round at someone else's.
alter table chat_in_person add column if not exists at_mine boolean not null default true;
-- 🗣️ How she talks: a short note about her voice (phrases she uses, how she punctuates, what she
-- never says). Filled in from her own messages with "Learn from chat", and yours to edit. It only
-- shapes HOW she says things — her personality and description always decide WHAT she says — and
-- the switch turns it off without losing what's written.
alter table chat_characters add column if not exists speech text not null default '' check (char_length(speech) <= 1200);
alter table chat_characters add column if not exists speech_on boolean not null default true;
-- ✏️ Which of her messages you rewrote yourself. "Learn from your edits" reads only these: your
-- edits are the examples of how she should sound, and the rest of the thread isn't.
alter table velo_messages add column if not exists edited boolean not null default false;
create index if not exists velo_messages_edited on velo_messages (user_id, character_id, created_at desc) where edited;

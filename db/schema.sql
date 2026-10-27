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

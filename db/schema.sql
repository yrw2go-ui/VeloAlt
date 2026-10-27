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

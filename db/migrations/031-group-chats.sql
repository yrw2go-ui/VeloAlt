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

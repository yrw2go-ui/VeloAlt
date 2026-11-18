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

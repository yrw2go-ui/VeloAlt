-- 🧰 Catch-up for alt's database: everything the app expects that may not be there yet.
-- Safe to run more than once — every line is "if not exists".

-- 🏠 063: the town they live in (About you), and where a Picagram woman lives.
alter table users add column if not exists home_town text check (home_town is null or char_length(home_town) <= 80);
alter table pica_accounts add column if not exists lives text check (lives is null or char_length(lives) <= 120);

-- 📝 080: their own photo wording.
alter table users add column if not exists prompt_words jsonb not null default '{}'::jsonb;

-- 🗺️ 109: which local spot she works at.
alter table chat_characters add column if not exists works_at text not null default '';

-- 👥 110: when you last read a group, so its unread count means something.
create table if not exists chat_group_reads (
  user_id uuid not null references users(id) on delete cascade,
  group_id uuid not null references chat_groups(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

-- 💬 111: the comment lines you add yourself in Settings → Admin.
alter table users add column if not exists pica_comments jsonb not null default '{}'::jsonb;

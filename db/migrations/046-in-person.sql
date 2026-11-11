-- 🧍 Together in person (not a scene): she talks face to face, and 👁️ ICU works.
create table if not exists chat_in_person (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  place text not null default '',
  started_at timestamptz not null default now(),
  primary key (user_id, character_id)
);

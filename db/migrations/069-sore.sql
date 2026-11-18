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

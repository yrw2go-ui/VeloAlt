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

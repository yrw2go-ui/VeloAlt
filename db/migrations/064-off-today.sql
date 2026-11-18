-- 🙈 A day she called off work or skipped class (so the app doesn't say she's there).
create table if not exists chat_off (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  day date not null,
  primary key (user_id, character_id, day)
);

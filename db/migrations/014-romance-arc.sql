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

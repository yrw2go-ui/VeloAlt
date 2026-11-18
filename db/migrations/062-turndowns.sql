-- 🙅‍♀️💬 What she last turned down, so that asking again (sweetly) can win her round.
create table if not exists chat_turndowns (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  ask text not null check (ask in ('scene', 'person', 'call')),
  at timestamptz not null default now(),
  primary key (user_id, character_id, ask)
);

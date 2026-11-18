-- 💑 The person a character is seeing who isn't a character of their own: their look, kept
-- so every picture of them has the same face. When the character moves on to someone else
-- (or it ends), the row goes with it and the next one starts from scratch.
create table if not exists chat_partner_looks (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  name text not null default '',
  look text not null default '',
  refs text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, character_id)
);

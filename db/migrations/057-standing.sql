-- 💞🤫 Where a romance stands: '' as before, 'gf' officially together (everyone knows),
-- 'secret' together but keeping it private in front of others.
alter table chat_characters add column if not exists standing text not null default '' check (standing in ('', 'gf', 'secret'));
-- Who has worked out a secret relationship: a character who got close enough to find out.
create table if not exists chat_secret_out (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade, -- the one in the secret relationship
  knower_id uuid not null references chat_characters(id) on delete cascade,    -- the one who found out
  at timestamptz not null default now(),
  primary key (user_id, character_id, knower_id)
);

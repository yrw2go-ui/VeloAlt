-- 🗣️ People you've named to a character in a chat who aren't characters themselves — the women on
-- your Picagram. She knows OF them from you: she's never met them, she can ask about them, and
-- she can look them up on Picagram. (Velo's own row has no knower, like chat_acquaintances.)
create table if not exists chat_known_accounts (
  user_id uuid not null references users(id) on delete cascade,
  knower_id uuid references chat_characters(id) on delete cascade,
  account_id uuid not null references pica_accounts(id) on delete cascade,
  mentions int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create unique index if not exists chat_known_accounts_one
  on chat_known_accounts (user_id, coalesce(knower_id, '00000000-0000-0000-0000-000000000000'::uuid), account_id);

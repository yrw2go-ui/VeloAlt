-- ✉️ Picagram DMs with accounts (not characters — those chat in the normal chat).
create table if not exists pica_dms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references pica_accounts(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '' check (char_length(content) <= 4000),
  media_id uuid references velo_media(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pica_dms_thread on pica_dms (user_id, account_id, created_at desc);

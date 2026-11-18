-- 📍 Local characters asking you over, or out somewhere: one a day at most, and not the same
-- person again for days. Kept so it stays occasional.
create table if not exists chat_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  kind text not null check (kind in ('mine', 'yours', 'out')),
  created_at timestamptz not null default now()
);
create index if not exists chat_invites_user on chat_invites (user_id, created_at desc);

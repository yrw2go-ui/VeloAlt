-- ⏰ Texts a character promised to send at a set time ("text me at 8"), delivered as a chat
-- message plus a push notification when the time comes.
create table if not exists chat_promises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  due_at timestamptz not null,
  about text not null check (char_length(about) between 1 and 300),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists chat_promises_due_idx on chat_promises (due_at) where status = 'pending';

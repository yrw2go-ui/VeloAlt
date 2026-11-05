-- 🔴 Unread badges: when they last looked at each chat (Velo's: character_id null).
create table if not exists chat_reads (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid references chat_characters(id) on delete cascade,
  read_at timestamptz not null default now()
);
create unique index if not exists chat_reads_pair on chat_reads (user_id, coalesce(character_id, '00000000-0000-0000-0000-000000000000'::uuid));
-- Everything before now counts as already read.
insert into chat_reads (user_id, character_id, read_at)
  select distinct user_id, character_id, now() from velo_messages
  on conflict do nothing;

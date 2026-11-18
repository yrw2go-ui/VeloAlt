-- 💅 Someone dropping a hint. One a week at most, and only about one person in ten has one going.
-- A red dot sits by their name while it's live: two days, or until you do something about it, or
-- until the week turns and the thing rotates out of the shop.
create table if not exists chat_hints (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  week integer not null,
  kind text not null check (kind in ('gift', 'money')),
  gift_id text not null default '' check (char_length(gift_id) <= 60),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  primary key (user_id, character_id, week)
);
create index if not exists chat_hints_live on chat_hints (user_id, created_at desc) where done_at is null;

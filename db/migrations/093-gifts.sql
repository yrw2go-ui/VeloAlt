-- 🎁 Picagifts: presents and money sent to the people in your world. A wallet to send it from,
-- and a record of what went where (that's what the 48-hour warm spell is worked out from).
alter table users add column if not exists wallet numeric(12,2) not null default 5000 check (wallet >= 0);
create table if not exists pica_gift_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid references chat_characters(id) on delete cascade, -- one of your characters
  account_id uuid references pica_accounts(id) on delete cascade,     -- or someone on Picagram
  kind text not null check (kind in ('gift', 'money')),
  gift_id text not null default '' check (char_length(gift_id) <= 60),
  amount numeric(12,2) not null check (amount >= 0),
  wished boolean not null default false,
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists pica_gift_sent_who on pica_gift_sent (user_id, character_id, created_at desc);
create index if not exists pica_gift_sent_acc on pica_gift_sent (user_id, account_id, created_at desc);

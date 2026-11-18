-- 🧠 A Picagram account's own brain ('' = same as Velo's), and what she remembers from your DMs (moves to her character memory if you befriend her).
alter table pica_accounts add column if not exists brain text not null default '' check (brain in ('', 'claude', 'qwen', 'qwen2', 'deepseek', 'kimi', 'qwen-chain'));
create table if not exists pica_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references pica_accounts(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 600),
  created_at timestamptz not null default now()
);
create index if not exists pica_memories_acc on pica_memories (user_id, account_id, created_at);

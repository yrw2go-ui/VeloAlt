-- 📅 Plans: a hangout or date a character and the person agreed on for a day. On that day the
-- chat (and a push, if they're on) asks them to set the scene so it can be played out.
create table if not exists chat_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  details text not null default '' check (char_length(details) <= 600),
  day date not null,
  status text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chat_plans_due_idx on chat_plans (user_id, day) where status = 'planned';

-- 💬 Velo's personality per person; romantic needs the adult confirmation first.
alter table users
  add column if not exists personality text not null default 'friend' check (personality in ('friend', 'professional', 'sarcastic', 'romantic')),
  add column if not exists adult_confirmed_at timestamptz;

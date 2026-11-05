-- 🔔 Check-ins: Velo and characters can text them first, with a push notification.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);
alter table users add column if not exists checkins text not null default 'sometimes' check (checkins in ('off', 'sometimes', 'often'));
create table if not exists chat_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid references chat_characters(id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index if not exists chat_checkins_user_idx on chat_checkins (user_id, sent_at desc);
-- App-wide settings the server makes for itself (e.g. its push keys), never shown to anyone.
create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now()
);

-- Velo Pro: subscription, the owner's verified phone, contacts, and actions
-- (texts and calls Velo makes for them — each one approved first).
alter table users
  add column if not exists plan text not null default 'free' check (plan in ('free', 'pro')),
  add column if not exists stripe_customer_id text,
  add column if not exists subscription_status text,
  add column if not exists phone text check (phone is null or phone ~ '^\+1[2-9][0-9]{9}$'),
  add column if not exists phone_verified_at timestamptz,
  add column if not exists phone_code_hash text,
  add column if not exists phone_code_expires timestamptz,
  add column if not exists phone_code_tries int not null default 0;
-- A verified number belongs to one account (it's how Velo knows who's texting or calling her).
create unique index if not exists users_verified_phone_idx on users (phone) where phone_verified_at is not null;
create index if not exists users_stripe_customer_idx on users (stripe_customer_id);

create table if not exists velo_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  phone text not null check (phone ~ '^\+1[2-9][0-9]{9}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists velo_contacts_name_idx on velo_contacts (user_id, lower(name));

-- kind: 'text' / 'call' (Velo reaching someone for them, approved first) or
-- 'inbound' (the owner calling Velo's number; holds the call's transcript).
create table if not exists velo_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('text', 'call', 'inbound')),
  to_name text check (to_name is null or char_length(to_name) <= 80),
  to_phone text,
  body text not null default '' check (char_length(body) <= 1600),
  status text not null default 'pending' check (status in ('pending', 'approved', 'calling', 'done', 'failed', 'cancelled')),
  result text check (result is null or char_length(result) <= 2000),
  transcript jsonb not null default '[]',
  twilio_sid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists velo_actions_user_idx on velo_actions (user_id, created_at desc);
create index if not exists velo_actions_sid_idx on velo_actions (twilio_sid);

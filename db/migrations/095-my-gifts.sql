-- 🛍️ Your own things to send, added by hand. They sit in the shop alongside the thirty and never
-- rotate out — they stay until you take them off the list. Five at most.
create table if not exists pica_my_gifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  brand text not null default '' check (char_length(brand) <= 40),
  price numeric(10,2) not null check (price >= 0 and price <= 1000000),
  created_at timestamptz not null default now()
);
create index if not exists pica_my_gifts_user on pica_my_gifts (user_id, created_at);

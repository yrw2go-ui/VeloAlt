-- 🔁 How many of the rotating things are in the shop in any one week. One row, and only ever one.
create table if not exists gift_shop (
  only_row boolean primary key default true check (only_row),
  rotating int not null default 10 check (rotating between 1 and 200),
  updated_at timestamptz not null default now()
);

-- 🛠️ Admin → Gifts: things added to the catalogue by hand — your icon, your price, and whether
-- the shop always has it or it takes its turn on the rotation with everything else.
create table if not exists gift_extras (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null default '',
  price int not null check (price >= 1 and price <= 1000000),
  emoji text not null default '🎁',
  kind text not null default 'treat',
  always boolean not null default false,
  created_at timestamptz not null default now()
);

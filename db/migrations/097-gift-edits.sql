-- 🛠️ Admin → Gifts: the price, brand and name of anything in the catalogue, changed by hand.
-- Only what's actually been changed is stored; everything else comes from the catalogue itself, so
-- a gift that's never been touched follows the code and a gift that has keeps its edit for good.
create table if not exists gift_edits (
  gift_id text primary key,
  name text,
  brand text,
  price int check (price is null or (price >= 1 and price <= 1000000)),
  updated_at timestamptz not null default now()
);

-- 🔁 How many of the rotating things are in the shop in any one week. One row, and only ever one.
create table if not exists gift_shop (
  only_row boolean primary key default true check (only_row),
  rotating int not null default 30 check (rotating between 1 and 200),
  updated_at timestamptz not null default now()
);

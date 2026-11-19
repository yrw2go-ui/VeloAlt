-- 🛠️ Admin → Gifts: things you add to the catalogue yourself, up to twenty.
--
-- Not the same as the ten you list in the Gifts panel: those are yours, carry a shopping bag, sit
-- at the top with a star and never rotate. These join the catalogue proper — you pick the icon, and
-- you say whether each one stays in the shop every week or takes its turn with the rest.
create table if not exists gift_extras (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  brand text not null default '' check (char_length(brand) <= 60),
  price int not null check (price >= 1 and price <= 1000000),
  emoji text not null default '🎁' check (char_length(emoji) between 1 and 8),
  kind text not null default 'treat' check (kind in ('bag', 'clothes', 'shoes', 'jewellery', 'beauty', 'tech', 'treat', 'home')),
  always boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists gift_extras_made on gift_extras (created_at);

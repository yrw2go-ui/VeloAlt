-- 📸 Picagram: pause after 4 days unlooked; other accounts (not characters) to follow; saved pictures.
alter table users add column if not exists pica_looked_at timestamptz;
create table if not exists pica_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  handle text not null check (char_length(handle) between 2 and 30),
  name text not null check (char_length(name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 300),
  look text not null default '' check (char_length(look) <= 600),
  followers int not null default 1000,
  followed boolean not null default false,
  avatar_media_id uuid references velo_media(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pica_accounts_user on pica_accounts (user_id);
alter table pica_posts add column if not exists account_id uuid references pica_accounts(id) on delete cascade;
create table if not exists pica_saved (
  user_id uuid not null references users(id) on delete cascade,
  media_id uuid not null references velo_media(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

-- 📸 Picagram: a pretend social app. Characters post every day (photos and text), strangers and friends
-- like and comment, and the person can post too. Each person has their own Picagram world.
alter table chat_characters add column if not exists big_following boolean not null default false;
alter table velo_media add column if not exists pica boolean not null default false;
create table if not exists pica_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  author_id uuid references chat_characters(id) on delete cascade, -- null: the person
  kind text not null check (kind in ('image', 'text')),
  caption text not null default '' check (char_length(caption) <= 2200),
  photo text not null default '' check (char_length(photo) <= 1500),
  media_id uuid references velo_media(id) on delete set null,
  likes_target int not null default 0,
  liked boolean not null default false,
  liked_by text[] not null default '{}',
  place text not null default '',
  seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pica_posts_feed on pica_posts (user_id, created_at desc);
create table if not exists pica_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references pica_posts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  author_id uuid references chat_characters(id) on delete cascade, -- a character they know
  mine boolean not null default false,                               -- the person
  name text not null default '',                                     -- a stranger's username
  text text not null check (char_length(text) between 1 and 600),
  created_at timestamptz not null default now()
);
create index if not exists pica_comments_post on pica_comments (post_id, created_at);
create table if not exists pica_days (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
-- ✈️ Out of town (from a vacation post): no meet-ups until they're back.
create table if not exists chat_away (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  place text not null default '',
  until date not null,
  primary key (user_id, character_id)
);

-- 📸 A photo/video that fails or stalls at the picture service is retried up to 3 times.
alter table velo_media add column if not exists retries int not null default 0;
-- 👋 Introductions: a character introduces someone of hers (always a new woman), made just for this person.
-- Their own characters (owner_id) stay private to them; hidden until they accept the introduction.
alter table chat_characters add column if not exists owner_id uuid references users(id) on delete cascade;
alter table chat_characters add column if not exists intro_status text check (intro_status is null or intro_status in ('pending', 'accepted'));
create table if not exists chat_intros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  introducer_id uuid not null references chat_characters(id) on delete cascade,
  character_id uuid references chat_characters(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  age int,
  status text not null default 'making' check (status in ('making', 'portrait', 'ready', 'accepted', 'declined', 'failed')),
  created_at timestamptz not null default now()
);
create index if not exists chat_intros_user on chat_intros (user_id, status);
alter table chat_relationships add column if not exists intro_count int not null default 0;
alter table chat_relationships add column if not exists intro_at int;
-- How two characters are related for this person (e.g. sisters, from an introduction); '' = they met in a group chat.
alter table chat_bonds add column if not exists kind text not null default '';

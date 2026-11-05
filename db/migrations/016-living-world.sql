-- 🎂 A character's own birthday (month-day).
alter table chat_characters add column if not exists birthday text not null default '' check (birthday = '' or birthday ~ '^[01][0-9]-[0-3][0-9]$');
-- 📸 Photos/videos Velo or a character OFFERS on their own wait for the person's OK before anything is made.
alter table velo_media drop constraint if exists velo_media_status_check;
alter table velo_media add constraint velo_media_status_check check (status in ('offered', 'declined', 'working', 'done', 'failed'));
alter table velo_media add column if not exists description text check (description is null or char_length(description) <= 400);
alter table velo_media add column if not exists refs text[] not null default '{}';
-- 👥 Who has heard of whom: when someone mentions character B while talking to A (or to Velo,
-- knower_id null), A slowly learns a little about B — from B's character sheet only, never
-- from what they told B.
create table if not exists chat_acquaintances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  knower_id uuid references chat_characters(id) on delete cascade,
  known_id uuid not null references chat_characters(id) on delete cascade,
  mentions integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create unique index if not exists chat_acquaintances_pair on chat_acquaintances (user_id, coalesce(knower_id, '00000000-0000-0000-0000-000000000000'::uuid), known_id);

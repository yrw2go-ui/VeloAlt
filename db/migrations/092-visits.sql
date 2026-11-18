-- 🧍 A finished visit is kept, not thrown away: a time together that ran past midnight has to be
-- rememberable afterwards ("that was last night, we both slept since"). Only one visit per person
-- is open at a time; the rest are history.
alter table chat_in_person add column if not exists ended_at timestamptz;
alter table chat_in_person drop constraint if exists chat_in_person_pkey;
alter table chat_in_person add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists chat_in_person_open on chat_in_person (user_id, character_id) where ended_at is null;
create index if not exists chat_in_person_ended on chat_in_person (user_id, character_id, ended_at desc) where ended_at is not null;

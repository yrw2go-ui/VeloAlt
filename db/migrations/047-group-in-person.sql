-- 🧍 A group hanging out in person (not a scene), and what each of them was just doing one-on-one with the person before joining up.
alter table chat_groups add column if not exists in_person_place text check (in_person_place is null or char_length(in_person_place) <= 120);
alter table chat_groups add column if not exists catch_up jsonb not null default '{}'::jsonb;

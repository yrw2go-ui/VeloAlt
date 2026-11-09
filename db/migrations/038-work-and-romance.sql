-- 💼 A character's work: attire, days (0 = Sunday … 6 = Saturday), hours (HH:MM, her own time zone), part-time.
-- 💞 Romance options: open to polyamory (possible, not guaranteed); 🌈 "kinda lesbian leaning" (men stay primary).
alter table chat_characters add column if not exists work_attire text not null default '' check (char_length(work_attire) <= 400);
alter table chat_characters add column if not exists work_days int[] not null default '{}';
alter table chat_characters add column if not exists work_start text not null default '' check (work_start = '' or work_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table chat_characters add column if not exists work_end text not null default '' check (work_end = '' or work_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table chat_characters add column if not exists part_time boolean not null default false;
alter table chat_characters add column if not exists poly_ok boolean not null default false;
alter table chat_characters add column if not exists sapphic boolean not null default false;

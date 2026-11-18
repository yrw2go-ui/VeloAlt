-- 🎓 Her class timetable, alongside her work week: which days, what hours, and where she studies.
alter table chat_characters add column if not exists class_days int[] not null default '{}';
alter table chat_characters add column if not exists class_start text not null default '' check (char_length(class_start) <= 5);
alter table chat_characters add column if not exists class_end text not null default '' check (char_length(class_end) <= 5);
alter table chat_characters add column if not exists school text not null default '' check (char_length(school) <= 200);

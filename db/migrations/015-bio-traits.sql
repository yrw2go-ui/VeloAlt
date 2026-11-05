-- 👤 "About you" (all optional): how they describe themselves, a photo (described once in
-- words so Velo and characters know their look), birthday or age, and the US state they live in.
alter table users add column if not exists bio text check (bio is null or char_length(bio) <= 1000);
alter table users add column if not exists bio_photo_file_id uuid references velo_files(id) on delete set null;
alter table users add column if not exists bio_photo_note text check (bio_photo_note is null or char_length(bio_photo_note) <= 600);
alter table users add column if not exists birthday date;
alter table users add column if not exists age integer check (age is null or age between 13 and 120);
alter table users add column if not exists home_state text check (home_state is null or char_length(home_state) <= 40);
alter table velo_files drop constraint if exists velo_files_kind_check;
alter table velo_files add constraint velo_files_kind_check check (kind in ('file', 'face', 'portrait', 'media', 'bio'));
-- 🎚️ A character's own time zone, temperament sliders (0–10) and the preset they started from.
alter table chat_characters add column if not exists time_zone text not null default '' check (char_length(time_zone) <= 64);
alter table chat_characters add column if not exists traits jsonb not null default '{}';
alter table chat_characters add column if not exists preset text not null default '' check (char_length(preset) <= 40);

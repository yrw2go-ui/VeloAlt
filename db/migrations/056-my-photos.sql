-- 📸 More than one photo of you in "About you" (better references for pictures of you).
alter table users add column if not exists bio_photo_notes jsonb not null default '{}'::jsonb;

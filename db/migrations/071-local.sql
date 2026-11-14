-- 📍 She lives within about an hour — close enough to actually see on a weeknight.
alter table chat_characters add column if not exists local boolean not null default false;

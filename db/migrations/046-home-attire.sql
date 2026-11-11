-- 🏠 At-home attire for characters.
alter table chat_characters add column if not exists home_attire text not null default '';

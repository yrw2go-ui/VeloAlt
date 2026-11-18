-- 🏠 She lives with you. When she's home you're in the same house, not texting.
alter table chat_characters add column if not exists live_in boolean not null default false;

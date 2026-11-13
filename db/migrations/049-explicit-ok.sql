-- Per-character: can send explicit/nude content on their own (character-initiated media).
alter table chat_characters add column if not exists explicit_ok boolean not null default false;

-- 🔒 "@Hailey …" in a group: a private text to one member — only she (and the person) sees it.
alter table chat_group_messages add column if not exists private_to uuid references chat_characters(id) on delete cascade;

-- 🤝 Befriend a Picagram account: she becomes a character (her photos as references).
alter table pica_accounts add column if not exists character_id uuid references chat_characters(id) on delete set null;

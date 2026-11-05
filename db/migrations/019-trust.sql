-- 🤝 Trust: how much a character trusts this person right now (0–100), moving a little
-- after each chat or call. Kept with the relationship (feelings may be empty if not romantic).
alter table chat_relationships alter column feelings drop not null;
alter table chat_relationships add column if not exists trust integer check (trust is null or trust between 0 and 100);

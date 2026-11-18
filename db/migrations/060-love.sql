-- 💗 How much a romantic character loves them (0–100): it starts from her nature and grows or
-- cools over time, with everything that happens between them.
alter table chat_relationships add column if not exists love integer check (love is null or love between 0 and 100);

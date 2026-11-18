-- 😊 How happy she is with them right now (0–100): it grows with attention and good chats, and
-- slips when she's left alone. The happier she is, the more she takes in her stride.
alter table chat_relationships add column if not exists happy integer check (happy is null or happy between 0 and 100);

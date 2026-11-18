-- ✏️ Which of her messages you rewrote yourself. "Learn from your edits" reads only these: your
-- edits are the examples of how she should sound, and the rest of the thread isn't.
alter table velo_messages add column if not exists edited boolean not null default false;
create index if not exists velo_messages_edited on velo_messages (user_id, character_id, created_at desc) where edited;

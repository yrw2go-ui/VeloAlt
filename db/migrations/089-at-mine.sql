-- 🏠 Whose place you're at while you're together: yours, or theirs. A knock at your door can't be
-- answered when you're round at someone else's.
alter table chat_in_person add column if not exists at_mine boolean not null default true;

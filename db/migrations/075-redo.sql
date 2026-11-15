-- ↻ Redo: a new picture made to take an old one's place. The link is kept on the new row so the
-- swap happens when it's actually ready — and the old one is deleted outright, not left behind.
alter table velo_media add column if not exists replaces uuid references velo_media(id) on delete set null;

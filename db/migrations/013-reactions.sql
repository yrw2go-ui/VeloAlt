-- ❤️ Their reaction to a photo/video Velo or a character sent (one at a time; tap again to remove).
alter table velo_media add column if not exists reaction text check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍'));

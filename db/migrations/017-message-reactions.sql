-- 😮 Reactions on any chat message: theirs on Velo's/a character's messages (reaction), and
-- Velo's/the character's on theirs (their_reaction). Shocked joins the set (photos/videos too).
alter table velo_messages add column if not exists reaction text check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮'));
alter table velo_messages add column if not exists their_reaction text check (their_reaction is null or their_reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮'));
alter table velo_media drop constraint if exists velo_media_reaction_check;
alter table velo_media add constraint velo_media_reaction_check check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮'));

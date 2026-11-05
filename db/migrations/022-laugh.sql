-- 😂 Laughing joins the reactions (messages, their reactions, photos/videos).
alter table velo_messages drop constraint if exists velo_messages_reaction_check;
alter table velo_messages add constraint velo_messages_reaction_check check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂'));
alter table velo_messages drop constraint if exists velo_messages_their_reaction_check;
alter table velo_messages add constraint velo_messages_their_reaction_check check (their_reaction is null or their_reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂'));
alter table velo_media drop constraint if exists velo_media_reaction_check;
alter table velo_media add constraint velo_media_reaction_check check (reaction is null or reaction in ('❤️', '🔥', '🙌', '😍', '👍', '😮', '😂'));

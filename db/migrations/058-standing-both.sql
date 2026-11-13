-- 💞🤫 Both can be true at once: his girlfriend, and nobody knows.
alter table chat_characters drop constraint if exists chat_characters_standing_check;
alter table chat_characters add constraint chat_characters_standing_check check (standing in ('', 'gf', 'secret', 'gf+secret'));

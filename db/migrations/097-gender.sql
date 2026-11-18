-- Stored gender, separate from the voice. Female by default.
alter table chat_characters add column if not exists gender text not null default 'female';
alter table chat_characters drop constraint if exists chat_characters_gender_check;
alter table chat_characters add constraint chat_characters_gender_check check (gender in ('female', 'male'));

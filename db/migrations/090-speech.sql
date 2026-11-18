-- 🗣️ How she talks: a short note about her voice (phrases she uses, how she punctuates, what she
-- never says). Filled in from her own messages with "Learn from chat", and yours to edit. It only
-- shapes HOW she says things — her personality and description always decide WHAT she says — and
-- the switch turns it off without losing what's written.
alter table chat_characters add column if not exists speech text not null default '' check (char_length(speech) <= 1200);
alter table chat_characters add column if not exists speech_on boolean not null default true;

-- 💗 She was into women only, and then there was them: once she's properly fallen for this one
-- person, she's bisexual from then on — still drawn to women, and drawn to them. Per person, so
-- a character everyone shares isn't changed for everybody by one person winning her over.
alter table chat_relationships add column if not exists won_over timestamptz;
-- 🏳️‍🌈 On her own card (only a character of theirs), the ⚢ tick comes off and this remembers why.
alter table chat_characters add column if not exists was_lesbian boolean not null default false;

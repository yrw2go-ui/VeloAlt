-- ⚢ How she is while she's into women: the same woman, a little different with you and with men.
-- Written alongside her usual personality and used only while the tick is on.
alter table chat_characters add column if not exists lesbian_personality text not null default ''
  check (char_length(lesbian_personality) <= 2000);
-- ⚢ And on a Picagram woman, so she's already herself when you befriend her.
alter table pica_accounts add column if not exists lesbian boolean not null default false;

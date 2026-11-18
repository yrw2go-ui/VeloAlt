-- 📍 Where she lives NOW, said plainly, instead of being guessed from her backstory. A card can
-- say she grew up in Arizona and works in Chicago; only this field says where she is today.
alter table chat_characters add column if not exists lives_in text not null default '' check (char_length(lives_in) <= 120);

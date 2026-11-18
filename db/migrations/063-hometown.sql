-- 🏠 The town or city they live in (with the state): new characters and Picagram women mostly live near it.
alter table users add column if not exists home_town text check (home_town is null or char_length(home_town) <= 80);
-- Where each Picagram woman lives (near them, or far away), so it sticks if she becomes a character.
alter table pica_accounts add column if not exists lives text check (lives is null or char_length(lives) <= 120);

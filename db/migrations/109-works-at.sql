-- 🗺️ Where she works, when it's one of the local spots (app/lib/places.ts). Her job can stay
-- "server" — this says the place, so nothing has to guess it from the words.
alter table chat_characters add column if not exists works_at text not null default '';

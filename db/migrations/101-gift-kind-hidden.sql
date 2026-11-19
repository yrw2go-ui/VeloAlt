-- 🛠️ Admin → Gifts: two more things you can change by hand about anything in the catalogue.
--
-- "kind" relabels it — something she wears can become one of the private ones. "hidden" takes it
-- out of the shop altogether without touching the catalogue, so it can always be put back.
alter table gift_edits add column if not exists kind text;
alter table gift_edits add column if not exists hidden boolean not null default false;

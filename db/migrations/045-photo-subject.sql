-- 👥 Who a photo is of ('me', 'me+Name', 'Name' or 'none'), so a reaction to a picture of someone else is about them, not the sender.
alter table velo_media add column if not exists subject text;

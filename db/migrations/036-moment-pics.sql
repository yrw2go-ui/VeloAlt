-- 📸 In-the-moment photos from characters: counts chat exchanges since her last photo, and when the next offer is due.
alter table chat_relationships add column if not exists pic_count int not null default 0;
alter table chat_relationships add column if not exists pic_at int;

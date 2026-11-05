-- 🖼️ A small thumbnail for each uploaded photo (the chat shows it; the full photo opens on tap).
alter table velo_files add column if not exists thumb_url text check (thumb_url is null or char_length(thumb_url) <= 1000);

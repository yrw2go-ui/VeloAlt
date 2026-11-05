-- 💕 A character can be romantic (PG-13, adults only). 🖼️ 2–4 reference images
-- (from its gallery) keep it looking the same in every photo and video.
alter table chat_characters add column if not exists romantic boolean not null default false;
alter table chat_characters add column if not exists reference_ids uuid[] not null default '{}' check (cardinality(reference_ids) <= 4);
-- Gallery: every photo/video gets a small thumbnail, can be kept (⭐), and says something when it arrives.
alter table velo_media add column if not exists thumb_file_id uuid references velo_files(id) on delete set null;
alter table velo_media add column if not exists poster_url text check (poster_url is null or char_length(poster_url) <= 1000);
alter table velo_media add column if not exists kept boolean not null default false;
alter table velo_media add column if not exists caption text check (caption is null or char_length(caption) <= 200);
create index if not exists velo_media_gallery_idx on velo_media (user_id, character_id, created_at desc) where status = 'done';

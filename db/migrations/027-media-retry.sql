-- 🔁 A photo/video that the picture service failed (or took too long on) is started again once.
alter table velo_media add column if not exists retried boolean not null default false;

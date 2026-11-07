-- 👀 Scene peeks: a photo of the scene as if they were there. She never knows — peek messages
-- and pictures are left out of everything the character reads.
alter table velo_messages add column if not exists peek boolean not null default false;
alter table velo_media add column if not exists peek boolean not null default false;

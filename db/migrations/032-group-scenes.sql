-- 🎬 A scene played out in a group chat, and 👀 peeks at it (one or more of the characters).
alter table chat_groups add column if not exists scene_title text check (scene_title is null or char_length(scene_title) <= 120);
alter table chat_groups add column if not exists scene_details text check (scene_details is null or char_length(scene_details) <= 1000);
alter table chat_group_messages add column if not exists media_id uuid references velo_media(id) on delete set null;
alter table chat_group_messages add column if not exists peek boolean not null default false;

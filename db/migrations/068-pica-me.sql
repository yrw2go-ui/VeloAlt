-- 👤 Your own Picagram profile: a bio and a picture of you that's yours to change.
alter table users add column if not exists pica_bio text not null default '' check (char_length(pica_bio) <= 300);
alter table users add column if not exists pica_avatar_file_id uuid references velo_files(id) on delete set null;
-- 🙈 Characters you'd rather not see on Picagram. Nothing she can notice — unlike unfollowing her.
alter table chat_characters add column if not exists pica_hidden boolean not null default false;
alter table velo_files drop constraint if exists velo_files_kind_check;
alter table velo_files add constraint velo_files_kind_check check (kind in ('file', 'face', 'portrait', 'media', 'bio', 'picame'));

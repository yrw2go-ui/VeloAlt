-- 👩 Accounts you made yourself: your specs, your pictures. Her new photos are built from those
-- references (a headshot and a full shot) instead of the first picture the app happened to make.
alter table pica_accounts add column if not exists mine boolean not null default false;
alter table pica_accounts add column if not exists ref_media_ids uuid[] not null default '{}';

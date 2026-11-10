-- 📵 A character's photo that wouldn't send: she tries again later ("my phone's acting up").
alter table velo_media add column if not exists resend_at timestamptz;
alter table velo_media add column if not exists resent boolean not null default false;
create index if not exists velo_media_resend on velo_media (resend_at) where resend_at is not null;

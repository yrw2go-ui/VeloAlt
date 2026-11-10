-- 💬 How long Velo's and the characters' replies usually are (their setting).
alter table users add column if not exists reply_length text not null default 'normal' check (reply_length in ('short', 'normal', 'long'));

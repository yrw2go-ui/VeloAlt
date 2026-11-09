-- 💬 Characters chatting among themselves in a group: after every 5–10 of the person's messages, a few lines between them.
alter table chat_groups add column if not exists since_banter int not null default 0;
alter table chat_groups add column if not exists banter_at int not null default 7;
alter table chat_groups add column if not exists banter_left int not null default 0;

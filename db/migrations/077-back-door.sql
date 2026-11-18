-- 🤫 A secret one comes round the back, and the door can be answered with someone already here.
alter table chat_dropins drop constraint if exists chat_dropins_kind_check;
alter table chat_dropins add constraint chat_dropins_kind_check check (kind in ('door', 'back', 'over'));

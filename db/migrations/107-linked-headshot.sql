-- 🖼️ A linked Picagram account wears the headshot from her character card, so you can see at a
-- glance which of them are joined up with a character and which are strangers.
update pica_accounts a set avatar_media_id = (
    select m.id from velo_media m
    where m.file_id = c.portrait_file_id and m.user_id = a.user_id and m.status = 'done'
    order by m.created_at desc limit 1)
from chat_characters c
where a.character_id = c.id and c.portrait_file_id is not null
  and exists (select 1 from velo_media m
    where m.file_id = c.portrait_file_id and m.user_id = a.user_id and m.status = 'done');

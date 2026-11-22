-- 🔗 Everyone already on Picagram under her own name, joined up with the character of that name.
-- Putting a character on Picagram only ever looked for an account already carrying her id, so one
-- invented before she was a character stayed unlinked for good. Only where the name is unambiguous:
-- exactly one account with it, exactly one character with it, and that character not on Picagram
-- already. Anything doubtful is left alone.
update pica_accounts a set character_id = c.id
from chat_characters c
where a.character_id is null
  and lower(a.name) = lower(c.name)
  and (c.owner_id is null or c.owner_id = a.user_id)
  and (select count(*) from pica_accounts a2 where a2.user_id = a.user_id and lower(a2.name) = lower(a.name)) = 1
  and (select count(*) from chat_characters c2 where (c2.owner_id is null or c2.owner_id = a.user_id) and lower(c2.name) = lower(c.name)) = 1
  and not exists (select 1 from pica_accounts a3 where a3.user_id = a.user_id and a3.character_id = c.id);

-- Her posts come with her: anything she wrote as a character now sits on her Picagram account.
update pica_posts p set account_id = a.id
from pica_accounts a
where a.user_id = p.user_id and a.character_id = p.author_id and p.account_id is null;

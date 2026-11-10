-- 👭 Links go one way: knower_id knows known_id. A link from both sides means they know each other.
-- Existing links were mutual, so each becomes two one-way links.
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'chat_character_links' and column_name = 'a_id') then
    alter table chat_character_links rename column a_id to knower_id;
    alter table chat_character_links rename column b_id to known_id;
    alter table chat_character_links drop constraint if exists chat_character_links_check;
    insert into chat_character_links (knower_id, known_id, kind, story, created_at)
      select known_id, knower_id, kind, story, created_at from chat_character_links on conflict do nothing;
  end if;
end $$;
alter table chat_character_links drop constraint if exists chat_character_links_not_self;
alter table chat_character_links add constraint chat_character_links_not_self check (knower_id <> known_id);

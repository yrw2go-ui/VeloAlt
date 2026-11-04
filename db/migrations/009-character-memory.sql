-- 🎭 Characters are made by admins and shared with everyone. Each has a
-- personality, backstory, relation to the person, and a call voice.
-- 🧠 Memories are kept per person AND per character (Velo's own: character_id null),
-- so nothing crosses between Velo and characters, or between characters.
alter table users add column if not exists is_admin boolean not null default false;

do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'chat_characters' and column_name = 'user_id') then
    alter table chat_characters drop constraint if exists chat_characters_user_id_fkey;
    alter table chat_characters rename column user_id to created_by;
    alter table chat_characters alter column created_by drop not null;
    alter table chat_characters add constraint chat_characters_created_by_fkey foreign key (created_by) references users(id) on delete set null;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'chat_characters' and column_name = 'about') then
    alter table chat_characters rename column about to personality;
  end if;
end $$;
alter table chat_characters drop constraint if exists chat_characters_about_check;
alter table chat_characters drop constraint if exists chat_characters_personality_check;
alter table chat_characters add constraint chat_characters_personality_check check (char_length(personality) <= 2000);
alter table chat_characters add column if not exists backstory text not null default '' check (char_length(backstory) <= 3000);
alter table chat_characters add column if not exists relation text not null default '' check (char_length(relation) <= 600);
alter table chat_characters add column if not exists voice text not null default 'sarah' check (char_length(voice) <= 40);
drop index if exists chat_characters_user_idx;
create index if not exists chat_characters_created_idx on chat_characters (created_at);

alter table velo_memories add column if not exists character_id uuid references chat_characters(id) on delete cascade;
create index if not exists velo_memories_thread_idx on velo_memories (user_id, character_id, kind, created_at desc);

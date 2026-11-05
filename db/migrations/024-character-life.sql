-- 💼 A character's everyday life: their job, the casual clothes they usually wear, and favorite hobbies.
alter table chat_characters add column if not exists job text not null default '' check (char_length(job) <= 300);
alter table chat_characters add column if not exists casual_wear text not null default '' check (char_length(casual_wear) <= 400);
alter table chat_characters add column if not exists hobbies text not null default '' check (char_length(hobbies) <= 600);

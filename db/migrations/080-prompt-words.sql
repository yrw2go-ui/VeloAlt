-- 📝 Settings → Photo wording: their own version of the standing wording on every picture.
-- Only the lines they actually changed are kept, so a reworded default still reaches them.
alter table users add column if not exists prompt_words jsonb not null default '{}'::jsonb;

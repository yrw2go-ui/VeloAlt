-- 🛠️ Settings → Admin → Messaging & wording: their own version of the lines that shape how a
-- character talks. Only the lines they actually changed are kept.
alter table users add column if not exists talk_words jsonb not null default '{}'::jsonb;

-- 🧠 Who writes the posts on Picagram. Empty means the brain picked in Settings, as before.
-- Separate from the chat brain on purpose: when the Atlas brain you chat with stops answering,
-- the whole feed goes quiet with it, and this lets the posts carry on without changing her voice.
alter table users add column if not exists post_brain text not null default '';

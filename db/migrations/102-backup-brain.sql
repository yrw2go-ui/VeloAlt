-- 🛟 A backup brain, off unless it's switched on. '' (the default) means off: the brain
-- picked in Settings is the only one used, and nothing falls back to Claude behind the scenes.
alter table users add column if not exists backup_brain text not null default '';

-- 💬 Comment lines you added yourself in Settings → Admin, by group (complimentary, generic,
-- motivational, consoling, suggestive, happy). The built-in ones live in the code.
alter table users add column if not exists pica_comments jsonb not null default '{}'::jsonb;

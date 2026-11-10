-- 🕒 A scene's clock: on real time ('now') or its own scheduled time ('set', moving forward from set_time as it's played).
-- planned_time is the plan's time, so she knows when a scene got pushed back. Plans can keep a time of day too.
alter table chat_plans add column if not exists at_time text not null default '' check (at_time = '' or at_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table chat_scenes add column if not exists clock text not null default 'now' check (clock in ('now', 'set'));
alter table chat_scenes add column if not exists set_time text not null default '' check (set_time = '' or set_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table chat_scenes add column if not exists planned_time text not null default '' check (planned_time = '' or planned_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table chat_groups add column if not exists scene_clock text not null default 'now' check (scene_clock in ('now', 'set'));
alter table chat_groups add column if not exists scene_set_time text not null default '';
alter table chat_groups add column if not exists scene_started_at timestamptz;
alter table chat_scenes add column if not exists pushed boolean not null default false;

-- 👥 When you last read a group, so its unread count means something. One row per group per person.
create table if not exists chat_group_reads (
  user_id uuid not null references users(id) on delete cascade,
  group_id uuid not null references chat_groups(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

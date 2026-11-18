-- 🚗 You invited her over and you're not marked home: she says she's on her way, and then that
-- she's here and wondering where you are. Each happens once per plan.
alter table chat_plans add column if not exists on_way_at timestamptz;
alter table chat_plans add column if not exists arrived_at timestamptz;

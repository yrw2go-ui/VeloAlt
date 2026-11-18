-- 📅 A plan is either 🎥 a video chat or 🧍 seeing each other in person. Older plans stay as the
-- video chat they'd have been.
alter table chat_plans add column if not exists kind text not null default 'video' check (kind in ('video', 'person'));
-- 🔔 The pop-up that asks to start it at the agreed time fires once.
alter table chat_plans add column if not exists started_at timestamptz;

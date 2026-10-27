-- 🧠 Which AI each person chats with (Settings → Velo's brain).
alter table users add column if not exists chat_model text not null default 'claude' check (chat_model in ('claude', 'qwen', 'deepseek'));

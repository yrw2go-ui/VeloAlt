-- 🧠 A character's own brain: Qwen or DeepSeek through Atlas Cloud handles everything for her ('' = the person's choice in Settings).
alter table chat_characters add column if not exists brain text not null default '' check (brain in ('', 'qwen', 'deepseek'));

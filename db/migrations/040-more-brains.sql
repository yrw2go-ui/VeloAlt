-- 🧠 More brains per character: Claude (always Claude), Qwen (fast), Qwen (big), DeepSeek ('' = same as Velo).
alter table chat_characters drop constraint if exists chat_characters_brain_check;
alter table chat_characters add constraint chat_characters_brain_check check (brain in ('', 'claude', 'qwen', 'qwen2', 'deepseek'));

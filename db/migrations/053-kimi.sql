-- 🧠 Kimi (Moonshot AI) through Atlas Cloud: a brain for characters and for Velo.
alter table chat_characters drop constraint if exists chat_characters_brain_check;
alter table chat_characters add constraint chat_characters_brain_check check (brain in ('', 'claude', 'qwen', 'qwen2', 'deepseek', 'kimi', 'qwen-chain'));
alter table users drop constraint if exists users_chat_model_check;
alter table users add constraint users_chat_model_check check (chat_model in ('claude', 'qwen', 'deepseek', 'kimi'));

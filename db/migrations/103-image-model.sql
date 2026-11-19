-- 🖼️ Which Seedream writes the pictures. '' = the built-in default (Seedream 5.0 Pro).
-- image_models holds any model you added yourself in Settings, so a new one can be used
-- the day Atlas Cloud has it, without a deploy.
alter table users add column if not exists image_model text not null default '';
alter table users add column if not exists image_models jsonb not null default '[]'::jsonb;

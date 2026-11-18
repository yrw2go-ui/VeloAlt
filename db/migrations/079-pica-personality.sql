-- 🎭 Picagram people get a personality of their own: a description and the nine sliders,
-- yours to edit, and they go with her if you befriend her.
alter table pica_accounts add column if not exists personality text check (personality is null or char_length(personality) <= 2000);
alter table pica_accounts add column if not exists traits jsonb not null default '{}'::jsonb;

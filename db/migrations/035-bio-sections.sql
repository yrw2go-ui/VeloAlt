-- 👤 More sections in "About you" (work, hobbies, favorites, family & pets, goals…), all optional.
alter table users add column if not exists bio_more jsonb not null default '{}';

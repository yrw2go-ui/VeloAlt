-- 💍 Where her heart is besides you.
--   status: single | dating (seeing someone, short-term) | married
--   sees_others: she may start something short-term of her own (weeks to months, never longer)
--   lesbian: into women; she flirts with other women more than with you until you win her round
alter table chat_characters add column if not exists attached text not null default 'single'
  check (attached in ('single', 'dating', 'married'));
alter table chat_characters add column if not exists sees_others boolean not null default false;
alter table chat_characters add column if not exists lesbian boolean not null default false;
-- Who she's with, and until when (a short-term thing of her own; married has no end date).
alter table chat_characters add column if not exists partner text not null default '' check (char_length(partner) <= 120);
alter table chat_characters add column if not exists attached_since date;
alter table chat_characters add column if not exists attached_until date;

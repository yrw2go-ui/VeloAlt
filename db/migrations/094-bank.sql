-- 💰 Two accounts behind Picagifts: what you can spend now, and the bank you move it from.
-- The bank pays interest weekly and wages land weekly; money_week is the last week settled, so
-- both are worked out when you look rather than by a clock running somewhere.
alter table users alter column wallet set default 20000;
alter table users add column if not exists bank numeric(14,2) not null default 480000 check (bank >= 0);
alter table users add column if not exists money_week integer not null default 0;
update users set wallet = 20000 where wallet = 5000 and not exists (select 1 from pica_gift_sent g where g.user_id = users.id);

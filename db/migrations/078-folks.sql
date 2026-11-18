-- 🏡 Ordinary people on Picagram: which of the six this account is (so each turns up once).
alter table pica_accounts add column if not exists folk text check (folk is null or char_length(folk) <= 40);

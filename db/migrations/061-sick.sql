-- 🤒 chat_away also covers being off colour: 'trip' (away, the default) or 'sick' (at home, run down).
alter table chat_away add column if not exists kind text not null default 'trip' check (kind in ('trip', 'sick'));

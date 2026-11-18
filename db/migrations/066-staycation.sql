-- 🏡 Time off at home (a staycation) alongside a trip away or a sick spell.
alter table chat_away drop constraint if exists chat_away_kind_check;
alter table chat_away add constraint chat_away_kind_check check (kind in ('trip', 'sick', 'stay'));

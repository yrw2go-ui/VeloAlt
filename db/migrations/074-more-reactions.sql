-- 😀 The six added to the bar (👀 👌 🤔 🫣 💦 😈) were allowed in the app but not by the database,
-- so picking one on a photo or a message was refused. Every reaction column now takes all eighteen.
do $$
declare t text; c text;
begin
  for t, c in values ('velo_messages', 'reaction'), ('velo_messages', 'their_reaction'),
                     ('velo_media', 'reaction'), ('chat_group_messages', 'reaction') loop
    execute format('alter table %I drop constraint if exists %I', t, t || '_' || c || '_check');
    execute format($f$alter table %I add constraint %I check (%I is null or %I in
      ('❤️','🔥','🙌','😍','👍','😮','😂','🥵','🤤','💦','😈','😏','👀','👌','🤔','🫣','😅','😴'))$f$,
      t, t || '_' || c || '_check', c, c);
  end loop;
end $$;

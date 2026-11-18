-- VeloAlt: schema the live database is missing, from 047-group-in-person through 097-gender.
-- Skipped (already on pre-merge main): 047-in-person, 048-kimi-brain, 049-explicit-ok.
-- One transaction. Safe to run twice (if not exists, drop constraint if exists, then re-add).
-- Adds tables, columns, indexes, and wider checks only. No dropped tables, no deletes.
-- The one data write is in 094: untouched starter wallets of 5000 with no gifts become 20000,
-- and only when the bank column is not there yet, so a second run leaves balances alone.
begin;

-- 047-group-in-person.sql
-- 🧍 A group hanging out in person (not a scene), and what each of them was just doing one-on-one with the person before joining up.
alter table chat_groups add column if not exists in_person_place text check (in_person_place is null or char_length(in_person_place) <= 120);
alter table chat_groups add column if not exists catch_up jsonb not null default '{}'::jsonb;

-- 048-group-private.sql
-- 🔒 "@Hailey …" in a group: a private text to one member — only she (and the person) sees it.
alter table chat_group_messages add column if not exists private_to uuid references chat_characters(id) on delete cascade;

-- 049-picagram.sql
-- 📸 Picagram: a pretend social app. Characters post every day (photos and text), strangers and friends
-- like and comment, and the person can post too. Each person has their own Picagram world.
alter table chat_characters add column if not exists big_following boolean not null default false;
alter table velo_media add column if not exists pica boolean not null default false;
create table if not exists pica_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  author_id uuid references chat_characters(id) on delete cascade, -- null: the person
  kind text not null check (kind in ('image', 'text')),
  caption text not null default '' check (char_length(caption) <= 2200),
  photo text not null default '' check (char_length(photo) <= 1500),
  media_id uuid references velo_media(id) on delete set null,
  likes_target int not null default 0,
  liked boolean not null default false,
  liked_by text[] not null default '{}',
  place text not null default '',
  seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pica_posts_feed on pica_posts (user_id, created_at desc);
create table if not exists pica_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references pica_posts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  author_id uuid references chat_characters(id) on delete cascade, -- a character they know
  mine boolean not null default false,                               -- the person
  name text not null default '',                                     -- a stranger's username
  text text not null check (char_length(text) between 1 and 600),
  created_at timestamptz not null default now()
);
create index if not exists pica_comments_post on pica_comments (post_id, created_at);
create table if not exists pica_days (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
-- ✈️ Out of town (from a vacation post): no meet-ups until they're back.
create table if not exists chat_away (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  place text not null default '',
  until date not null,
  primary key (user_id, character_id)
);

-- 050-pica-follow.sql
-- 📸 Picagram: pause after 4 days unlooked; other accounts (not characters) to follow; saved pictures.
alter table users add column if not exists pica_looked_at timestamptz;
create table if not exists pica_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  handle text not null check (char_length(handle) between 2 and 30),
  name text not null check (char_length(name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 300),
  look text not null default '' check (char_length(look) <= 600),
  followers int not null default 1000,
  followed boolean not null default false,
  avatar_media_id uuid references velo_media(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pica_accounts_user on pica_accounts (user_id);
alter table pica_posts add column if not exists account_id uuid references pica_accounts(id) on delete cascade;
create table if not exists pica_saved (
  user_id uuid not null references users(id) on delete cascade,
  media_id uuid not null references velo_media(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

-- 051-pica-befriend.sql
-- 🤝 Befriend a Picagram account: she becomes a character (her photos as references).
alter table pica_accounts add column if not exists character_id uuid references chat_characters(id) on delete set null;

-- 052-pica-like-times.sql
-- ❤️ When each named liker likes a post (seconds after it went up), so likes trickle in instead of all at once.
alter table pica_posts add column if not exists liker_secs int[] not null default '{}';

-- 053-kimi.sql
-- 🧠 Kimi (Moonshot AI) through Atlas Cloud: a brain for characters and for Velo.
alter table chat_characters drop constraint if exists chat_characters_brain_check;
alter table chat_characters add constraint chat_characters_brain_check check (brain in ('', 'claude', 'qwen', 'qwen2', 'deepseek', 'kimi', 'qwen-chain'));
alter table users drop constraint if exists users_chat_model_check;
alter table users add constraint users_chat_model_check check (chat_model in ('claude', 'qwen', 'deepseek', 'kimi'));

-- 054-pica-dms.sql
-- ✉️ Picagram DMs with accounts (not characters — those chat in the normal chat).
create table if not exists pica_dms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references pica_accounts(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '' check (char_length(content) <= 4000),
  media_id uuid references velo_media(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pica_dms_thread on pica_dms (user_id, account_id, created_at desc);

-- 055-pica-account-brain.sql
-- 🧠 A Picagram account's own brain ('' = same as Velo's), and what she remembers from your DMs (moves to her character memory if you befriend her).
alter table pica_accounts add column if not exists brain text not null default '' check (brain in ('', 'claude', 'qwen', 'qwen2', 'deepseek', 'kimi', 'qwen-chain'));
create table if not exists pica_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references pica_accounts(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 600),
  created_at timestamptz not null default now()
);
create index if not exists pica_memories_acc on pica_memories (user_id, account_id, created_at);

-- 056-my-photos.sql
-- 📸 More than one photo of you in "About you" (better references for pictures of you).
alter table users add column if not exists bio_photo_notes jsonb not null default '{}'::jsonb;

-- 057-standing.sql
-- 💞🤫 Where a romance stands: '' as before, 'gf' officially together (everyone knows),
-- 'secret' together but keeping it private in front of others.
alter table chat_characters add column if not exists standing text not null default '' check (standing in ('', 'gf', 'secret'));
-- Who has worked out a secret relationship: a character who got close enough to find out.
create table if not exists chat_secret_out (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade, -- the one in the secret relationship
  knower_id uuid not null references chat_characters(id) on delete cascade,    -- the one who found out
  at timestamptz not null default now(),
  primary key (user_id, character_id, knower_id)
);

-- 058-standing-both.sql
-- 💞🤫 Both can be true at once: his girlfriend, and nobody knows.
alter table chat_characters drop constraint if exists chat_characters_standing_check;
alter table chat_characters add constraint chat_characters_standing_check check (standing in ('', 'gf', 'secret', 'gf+secret'));

-- 059-happy.sql
-- 😊 How happy she is with them right now (0–100): it grows with attention and good chats, and
-- slips when she's left alone. The happier she is, the more she takes in her stride.
alter table chat_relationships add column if not exists happy integer check (happy is null or happy between 0 and 100);

-- 060-love.sql
-- 💗 How much a romantic character loves them (0–100): it starts from her nature and grows or
-- cools over time, with everything that happens between them.
alter table chat_relationships add column if not exists love integer check (love is null or love between 0 and 100);

-- 061-sick.sql
-- 🤒 chat_away also covers being off colour: 'trip' (away, the default) or 'sick' (at home, run down).
alter table chat_away add column if not exists kind text not null default 'trip' check (kind in ('trip', 'sick'));

-- 062-turndowns.sql
-- 🙅‍♀️💬 What she last turned down, so that asking again (sweetly) can win her round.
create table if not exists chat_turndowns (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  ask text not null check (ask in ('scene', 'person', 'call')),
  at timestamptz not null default now(),
  primary key (user_id, character_id, ask)
);

-- 063-hometown.sql
-- 🏠 The town or city they live in (with the state): new characters and Picagram women mostly live near it.
alter table users add column if not exists home_town text check (home_town is null or char_length(home_town) <= 80);
-- Where each Picagram woman lives (near them, or far away), so it sticks if she becomes a character.
alter table pica_accounts add column if not exists lives text check (lives is null or char_length(lives) <= 120);

-- 064-off-today.sql
-- 🙈 A day she called off work or skipped class (so the app doesn't say she's there).
create table if not exists chat_off (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  day date not null,
  primary key (user_id, character_id, day)
);

-- 065-class.sql
-- 🎓 Her class timetable, alongside her work week: which days, what hours, and where she studies.
alter table chat_characters add column if not exists class_days int[] not null default '{}';
alter table chat_characters add column if not exists class_start text not null default '' check (char_length(class_start) <= 5);
alter table chat_characters add column if not exists class_end text not null default '' check (char_length(class_end) <= 5);
alter table chat_characters add column if not exists school text not null default '' check (char_length(school) <= 200);

-- 066-staycation.sql
-- 🏡 Time off at home (a staycation) alongside a trip away or a sick spell.
alter table chat_away drop constraint if exists chat_away_kind_check;
alter table chat_away add constraint chat_away_kind_check check (kind in ('trip', 'sick', 'stay'));

-- 067-pica-made.sql
-- 👩 Accounts you made yourself: your specs, your pictures. Her new photos are built from those
-- references (a headshot and a full shot) instead of the first picture the app happened to make.
alter table pica_accounts add column if not exists mine boolean not null default false;
alter table pica_accounts add column if not exists ref_media_ids uuid[] not null default '{}';

-- 068-pica-me.sql
-- 👤 Your own Picagram profile: a bio and a picture of you that's yours to change.
alter table users add column if not exists pica_bio text not null default '' check (char_length(pica_bio) <= 300);
alter table users add column if not exists pica_avatar_file_id uuid references velo_files(id) on delete set null;
-- 🙈 Characters you'd rather not see on Picagram. Nothing she can notice — unlike unfollowing her.
alter table chat_characters add column if not exists pica_hidden boolean not null default false;
alter table velo_files drop constraint if exists velo_files_kind_check;
alter table velo_files add constraint velo_files_kind_check check (kind in ('file', 'face', 'portrait', 'media', 'bio', 'picame'));

-- 069-sore.sql
-- 💔 Something hurt her. She goes a bit quiet for a while — at most 48 hours, and sooner if
-- he puts it right. One sore spot at a time per person; a new one replaces the old.
create table if not exists chat_sore (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  why text not null default '' check (char_length(why) <= 300),
  level int not null default 1 check (level between 1 and 3),
  since timestamptz not null default now(),
  until timestamptz not null,
  primary key (user_id, character_id)
);

-- 070-live-in.sql
-- 🏠 She lives with you. When she's home you're in the same house, not texting.
alter table chat_characters add column if not exists live_in boolean not null default false;

-- 071-local.sql
-- 📍 She lives within about an hour — close enough to actually see on a weeknight.
alter table chat_characters add column if not exists local boolean not null default false;

-- 072-attached.sql
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

-- 073-lesbian-personality.sql
-- ⚢ How she is while she's into women: the same woman, a little different with you and with men.
-- Written alongside her usual personality and used only while the tick is on.
alter table chat_characters add column if not exists lesbian_personality text not null default ''
  check (char_length(lesbian_personality) <= 2000);
-- ⚢ And on a Picagram woman, so she's already herself when you befriend her.
alter table pica_accounts add column if not exists lesbian boolean not null default false;

-- 074-more-reactions.sql
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

-- 075-redo.sql
-- ↻ Redo: a new picture made to take an old one's place. The link is kept on the new row so the
-- swap happens when it's actually ready — and the old one is deleted outright, not left behind.
alter table velo_media add column if not exists replaces uuid references velo_media(id) on delete set null;

-- 076-neighbor.sql
-- 🏘️ Neighbours: she lives a few doors down, knows it, and can stop by when you're home.
alter table chat_characters add column if not exists neighbor boolean not null default false;
-- 🏠 Whether you're home right now (yours, not hers — one switch for the whole street).
alter table users add column if not exists at_home boolean not null default false;
alter table users add column if not exists at_home_at timestamptz;
-- 🔔 Someone at the door, or asking you over. Nothing happens to how she feels either way.
create table if not exists chat_dropins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  kind text not null check (kind in ('door', 'over')),
  line text not null check (char_length(line) <= 300),
  status text not null default 'waiting' check (status in ('waiting', 'answered', 'ignored')),
  created_at timestamptz not null default now()
);
create index if not exists chat_dropins_user on chat_dropins (user_id, created_at desc);

-- 077-back-door.sql
-- 🤫 A secret one comes round the back, and the door can be answered with someone already here.
alter table chat_dropins drop constraint if exists chat_dropins_kind_check;
alter table chat_dropins add constraint chat_dropins_kind_check check (kind in ('door', 'back', 'over'));

-- 078-folks.sql
-- 🏡 Ordinary people on Picagram: which of the six this account is (so each turns up once).
alter table pica_accounts add column if not exists folk text check (folk is null or char_length(folk) <= 40);

-- 079-pica-personality.sql
-- 🎭 Picagram people get a personality of their own: a description and the nine sliders,
-- yours to edit, and they go with her if you befriend her.
alter table pica_accounts add column if not exists personality text check (personality is null or char_length(personality) <= 2000);
alter table pica_accounts add column if not exists traits jsonb not null default '{}'::jsonb;

-- 080-prompt-words.sql
-- 📝 Settings → Photo wording: their own version of the standing wording on every picture.
-- Only the lines they actually changed are kept, so a reworded default still reaches them.
alter table users add column if not exists prompt_words jsonb not null default '{}'::jsonb;

-- 081-lives-in.sql
-- 📍 Where she lives NOW, said plainly, instead of being guessed from her backstory. A card can
-- say she grew up in Arizona and works in Chicago; only this field says where she is today.
alter table chat_characters add column if not exists lives_in text not null default '' check (char_length(lives_in) <= 120);

-- 082-talk-words.sql
-- 🛠️ Settings → Admin → Messaging & wording: their own version of the lines that shape how a
-- character talks. Only the lines they actually changed are kept.
alter table users add column if not exists talk_words jsonb not null default '{}'::jsonb;

-- 083-won-over.sql
-- 💗 She was into women only, and then there was them: once she's properly fallen for this one
-- person, she's bisexual from then on — still drawn to women, and drawn to them. Per person, so
-- a character everyone shares isn't changed for everybody by one person winning her over.
alter table chat_relationships add column if not exists won_over timestamptz;
-- 🏳️‍🌈 On her own card (only a character of theirs), the ⚢ tick comes off and this remembers why.
alter table chat_characters add column if not exists was_lesbian boolean not null default false;

-- 084-plan-kind.sql
-- 📅 A plan is either 🎥 a video chat or 🧍 seeing each other in person. Older plans stay as the
-- video chat they'd have been.
alter table chat_plans add column if not exists kind text not null default 'video' check (kind in ('video', 'person'));
-- 🔔 The pop-up that asks to start it at the agreed time fires once.
alter table chat_plans add column if not exists started_at timestamptz;

-- 085-on-the-way.sql
-- 🚗 You invited her over and you're not marked home: she says she's on her way, and then that
-- she's here and wondering where you are. Each happens once per plan.
alter table chat_plans add column if not exists on_way_at timestamptz;
alter table chat_plans add column if not exists arrived_at timestamptz;

-- 086-partner-looks.sql
-- 💑 The person a character is seeing who isn't a character of their own: their look, kept
-- so every picture of them has the same face. When the character moves on to someone else
-- (or it ends), the row goes with it and the next one starts from scratch.
create table if not exists chat_partner_looks (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  name text not null default '',
  look text not null default '',
  refs text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, character_id)
);

-- 087-invites.sql
-- 📍 Local characters asking you over, or out somewhere: one a day at most, and not the same
-- person again for days. Kept so it stays occasional.
create table if not exists chat_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  kind text not null check (kind in ('mine', 'yours', 'out')),
  created_at timestamptz not null default now()
);
create index if not exists chat_invites_user on chat_invites (user_id, created_at desc);

-- 088-known-people.sql
-- 🗣️ People you've named to a character in a chat who aren't characters themselves — the women on
-- your Picagram. She knows OF them from you: she's never met them, she can ask about them, and
-- she can look them up on Picagram. (Velo's own row has no knower, like chat_acquaintances.)
create table if not exists chat_known_accounts (
  user_id uuid not null references users(id) on delete cascade,
  knower_id uuid references chat_characters(id) on delete cascade,
  account_id uuid not null references pica_accounts(id) on delete cascade,
  mentions int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create unique index if not exists chat_known_accounts_one
  on chat_known_accounts (user_id, coalesce(knower_id, '00000000-0000-0000-0000-000000000000'::uuid), account_id);

-- 089-at-mine.sql
-- 🏠 Whose place you're at while you're together: yours, or theirs. A knock at your door can't be
-- answered when you're round at someone else's.
alter table chat_in_person add column if not exists at_mine boolean not null default true;

-- 090-speech.sql
-- 🗣️ How she talks: a short note about her voice (phrases she uses, how she punctuates, what she
-- never says). Filled in from her own messages with "Learn from chat", and yours to edit. It only
-- shapes HOW she says things — her personality and description always decide WHAT she says — and
-- the switch turns it off without losing what's written.
alter table chat_characters add column if not exists speech text not null default '' check (char_length(speech) <= 1200);
alter table chat_characters add column if not exists speech_on boolean not null default true;

-- 091-edited.sql
-- ✏️ Which of her messages you rewrote yourself. "Learn from your edits" reads only these: your
-- edits are the examples of how she should sound, and the rest of the thread isn't.
alter table velo_messages add column if not exists edited boolean not null default false;
create index if not exists velo_messages_edited on velo_messages (user_id, character_id, created_at desc) where edited;

-- 092-visits.sql
-- 🧍 A finished visit is kept, not thrown away: a time together that ran past midnight has to be
-- rememberable afterwards ("that was last night, we both slept since"). Only one visit per person
-- is open at a time; the rest are history.
alter table chat_in_person add column if not exists ended_at timestamptz;
alter table chat_in_person drop constraint if exists chat_in_person_pkey;
alter table chat_in_person add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists chat_in_person_open on chat_in_person (user_id, character_id) where ended_at is null;
create index if not exists chat_in_person_ended on chat_in_person (user_id, character_id, ended_at desc) where ended_at is not null;

-- 093-gifts.sql
-- 🎁 Picagifts: presents and money sent to the people in your world. A wallet to send it from,
-- and a record of what went where (that's what the 48-hour warm spell is worked out from).
alter table users add column if not exists wallet numeric(12,2) not null default 5000 check (wallet >= 0);
create table if not exists pica_gift_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid references chat_characters(id) on delete cascade, -- one of your characters
  account_id uuid references pica_accounts(id) on delete cascade,     -- or someone on Picagram
  kind text not null check (kind in ('gift', 'money')),
  gift_id text not null default '' check (char_length(gift_id) <= 60),
  amount numeric(12,2) not null check (amount >= 0),
  wished boolean not null default false,
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists pica_gift_sent_who on pica_gift_sent (user_id, character_id, created_at desc);
create index if not exists pica_gift_sent_acc on pica_gift_sent (user_id, account_id, created_at desc);

-- 094-bank.sql
-- 💰 Two accounts behind Picagifts: what you can spend now, and the bank you move it from.
-- The bank pays interest weekly and wages land weekly; money_week is the last week settled, so
-- both are worked out when you look rather than by a clock running somewhere.
-- Backfill, once: migration 093 adds wallet at a 5000 starter. The starter that should stick
-- is 20000. Rows still on that untouched 5000, with no gift sent, move up — and only while
-- the bank column is absent, so running this file again cannot rewrite a later balance.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'bank'
  ) then
    update users
      set wallet = 20000
      where wallet = 5000
        and not exists (select 1 from pica_gift_sent g where g.user_id = users.id);
  end if;
end $$;
alter table users alter column wallet set default 20000;
alter table users add column if not exists bank numeric(14,2) not null default 480000 check (bank >= 0);
alter table users add column if not exists money_week integer not null default 0;

-- 095-my-gifts.sql
-- 🛍️ Your own things to send, added by hand. They sit in the shop alongside the thirty and never
-- rotate out — they stay until you take them off the list. Five at most.
create table if not exists pica_my_gifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  brand text not null default '' check (char_length(brand) <= 40),
  price numeric(10,2) not null check (price >= 0 and price <= 1000000),
  created_at timestamptz not null default now()
);
create index if not exists pica_my_gifts_user on pica_my_gifts (user_id, created_at);

-- 096-hints.sql
-- 💅 Someone dropping a hint. One a week at most, and only about one person in ten has one going.
-- A red dot sits by their name while it's live: two days, or until you do something about it, or
-- until the week turns and the thing rotates out of the shop.
create table if not exists chat_hints (
  user_id uuid not null references users(id) on delete cascade,
  character_id uuid not null references chat_characters(id) on delete cascade,
  week integer not null,
  kind text not null check (kind in ('gift', 'money')),
  gift_id text not null default '' check (char_length(gift_id) <= 60),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  primary key (user_id, character_id, week)
);
create index if not exists chat_hints_live on chat_hints (user_id, created_at desc) where done_at is null;

-- 097-gender.sql
-- Stored gender, separate from the voice. Female by default.
alter table chat_characters add column if not exists gender text not null default 'female';
alter table chat_characters drop constraint if exists chat_characters_gender_check;
alter table chat_characters add constraint chat_characters_gender_check check (gender in ('female', 'male'));

commit;

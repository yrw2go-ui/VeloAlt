-- ❤️ When each named liker likes a post (seconds after it went up), so likes trickle in instead of all at once.
alter table pica_posts add column if not exists liker_secs int[] not null default '{}';

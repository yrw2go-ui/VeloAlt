-- 🔎 The every-minute cron looks for photos that are mid-resend, oldest first. Nothing indexed
-- that: the media indexes all start with user_id, and the ordering is on a coalesce() of two
-- columns, so Postgres read every row of velo_media and sorted the lot — every minute, growing
-- with every picture ever made, until the statement timeout cancelled it. Indexing the expression
-- is what makes the ordering free; the WHERE keeps the index to the handful of rows mid-resend.
create index if not exists velo_media_resent_idx
  on velo_media (coalesce(claimed_at, created_at))
  where resent and status = 'working';

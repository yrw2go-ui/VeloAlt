-- ⏸️ Paused: nothing new happens while it is on — no posts, no check-ins, no texts they promised,
-- no invitations, no photos coming back. Everything already there stays exactly as it is, and
-- turning it off lets the world start up again.
alter table users add column if not exists paused boolean not null default false;

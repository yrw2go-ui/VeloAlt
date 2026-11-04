-- 📎 Files saved to Vercel Blob: chat attachments (kind 'file') and Velo's
-- custom face (kind 'face'). Each person sees and deletes only their own.
create table if not exists velo_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null default 'file' check (kind in ('file', 'face')),
  url text not null check (char_length(url) <= 1000),
  pathname text not null check (char_length(pathname) <= 600),
  name text not null check (char_length(name) between 1 and 200),
  content_type text not null check (char_length(content_type) <= 100),
  size integer not null check (size >= 0),
  created_at timestamptz not null default now()
);
create index if not exists velo_files_user_idx on velo_files (user_id, kind, created_at desc);
-- A chat message can carry one attachment.
alter table velo_messages add column if not exists file_id uuid references velo_files(id) on delete set null;

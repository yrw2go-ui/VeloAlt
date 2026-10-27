-- Social posting (Velo Pro): a connected Facebook Page per person, and
-- 'post' actions (drafted by Velo, published only when approved).
create table if not exists social_accounts (
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('facebook')),
  page_id text,
  page_name text check (page_name is null or char_length(page_name) <= 200),
  page_token text,          -- AES-256-GCM sealed (app/lib/fbCrypto.ts), never sent to the browser
  pending_pages text,       -- sealed list while they pick one of several Pages
  pending_until timestamptz,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table velo_actions drop constraint if exists velo_actions_kind_check;
alter table velo_actions add constraint velo_actions_kind_check check (kind in ('text', 'call', 'inbound', 'post'));

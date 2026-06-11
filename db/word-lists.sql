-- Word lists: one active list per class ("Ugens ord").
-- Run manually in the Supabase SQL editor (project cfkddsiwwujbbxjuthie).
create table word_lists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique references groups(id) on delete cascade,
  words jsonb not null default '[]'::jsonb,
  created_by text,
  updated_at timestamptz not null default now()
);
alter table word_lists disable row level security;

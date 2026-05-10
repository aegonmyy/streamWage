-- Run this in your Supabase SQL editor

create table if not exists worker_enrollments (
  id uuid primary key default gen_random_uuid(),
  worker_address text not null,       -- lowercase 0x address
  contract_address text not null,     -- lowercase 0x address
  chain_id integer not null,
  created_at timestamptz default now() not null,
  unique (worker_address, contract_address, chain_id)
);

-- Index for the primary query pattern: look up by worker
create index if not exists worker_enrollments_worker_idx
  on worker_enrollments (worker_address);

-- Enable Row Level Security
alter table worker_enrollments enable row level security;

-- Anyone can read enrollments (needed for wallet lookup on the frontend)
create policy "enrollments_read"
  on worker_enrollments for select
  using (true);

-- Anyone can insert/upsert (the frontend writes directly via anon key)
-- The unique constraint prevents duplicates
create policy "enrollments_insert"
  on worker_enrollments for insert
  with check (true);

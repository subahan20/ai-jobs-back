create table if not exists public.ai_search (
  id text primary key,
  job_title text not null,
  company_name text,
  location text,
  salary text,
  experience text,
  skills text,
  job_description text,
  apply_url text,
  platform text,
  employment_type text,
  remote boolean default false,
  posted_at timestamptz,
  scraped_at timestamptz,
  job_category text,
  source text,
  company_logo text,
  is_admin_synced boolean default true,
  sync_time timestamptz,
  created_at timestamptz default now()
);

-- Indexes for faster lookups
create index if not exists ai_search_job_category_idx on public.ai_search (job_category);
create index if not exists ai_search_platform_idx on public.ai_search (platform);

-- Enable RLS and allow public read access
alter table public.ai_search enable row level security;
create policy "Allow public read access on ai_search" on public.ai_search for select using (true);

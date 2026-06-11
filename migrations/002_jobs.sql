create table if not exists public.jobs (
  id text primary key,
  title text not null,
  company text not null,
  logo_url text,
  logo_color text,
  source text default 'Admin Portal',
  experience_level text,
  min_experience_years integer default 0,
  skills_required jsonb default '[]'::jsonb,
  salary text,
  location text,
  description text,
  posted_time text,
  url text,
  employment_type text,
  category text,
  remote_on_site text,
  publish_state text default 'Published',
  status text default 'Active',
  created_at timestamptz default now()
);

create index if not exists jobs_source_idx on public.jobs (source);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);

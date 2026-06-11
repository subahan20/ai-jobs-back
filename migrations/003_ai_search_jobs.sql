create table if not exists public.ai_search_jobs (
  id text primary key,
  user_id text not null,
  platform text not null,
  title text not null,
  company text,
  location text,
  salary text,
  description text,
  url text,
  skills_required jsonb default '[]'::jsonb,
  min_experience_years integer default 0,
  role_searched text,
  skills_searched text,
  experience_searched integer default 0,
  created_at timestamptz default now()
);

create index if not exists ai_search_jobs_user_id_idx on public.ai_search_jobs (user_id);
create index if not exists ai_search_jobs_platform_idx on public.ai_search_jobs (platform);

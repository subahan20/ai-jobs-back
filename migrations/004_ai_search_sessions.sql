create table if not exists public.ai_search_sessions (
  id text primary key,
  user_id text not null,
  status text not null default 'active',
  logs jsonb default '[]'::jsonb,
  error text,
  role_searched text,
  skills_searched text,
  experience_searched integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists ai_search_sessions_user_id_idx on public.ai_search_sessions (user_id);

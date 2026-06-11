-- User profile table (full form data from my-app profile page)
create table if not exists public.profile (
  id text primary key,
  first_name text,
  last_name text,
  email text,
  phone text,
  location text,
  portfolio_url text,
  degree text,
  university text,
  graduation_year text,
  cgpa text,
  preferred_role text,
  core_skills jsonb default '[]'::jsonb,
  current_ctc text,
  expected_ctc text,
  work_experience text,
  linkedin_url text,
  github_url text,
  leetcode_url text,
  resume_source text,
  resume_url text,
  notice_period text,
  provider text,
  last_sign_in timestamptz,
  updated_at timestamptz default now()
);

create index if not exists profile_email_idx on public.profile (email);

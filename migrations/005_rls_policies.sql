-- Enable RLS for direct client access. Backend service role bypasses these policies.
-- Cast both sides to text so policies work whether id/user_id columns are text or uuid.

alter table public.profile enable row level security;
alter table public.jobs enable row level security;
alter table public.ai_search_jobs enable row level security;
alter table public.ai_search_sessions enable row level security;

drop policy if exists profile_owner_all on public.profile;
create policy profile_owner_all on public.profile
  for all
  using ((auth.uid())::text = (id)::text)
  with check ((auth.uid())::text = (id)::text);

drop policy if exists jobs_public_read on public.jobs;
create policy jobs_public_read on public.jobs
  for select
  using (true);

drop policy if exists ai_search_jobs_owner_all on public.ai_search_jobs;
create policy ai_search_jobs_owner_all on public.ai_search_jobs
  for all
  using ((auth.uid())::text = (user_id)::text)
  with check ((auth.uid())::text = (user_id)::text);

drop policy if exists ai_search_sessions_owner_all on public.ai_search_sessions;
create policy ai_search_sessions_owner_all on public.ai_search_sessions
  for all
  using ((auth.uid())::text = (user_id)::text)
  with check ((auth.uid())::text = (user_id)::text);

import { supabase } from '../config/supabase.js';

export async function createSearchSession({ id, userId, searchMeta }, client = supabase) {
  const { error } = await client.from('ai_search_sessions').insert({
    id,
    user_id: userId,
    status: 'active',
    logs: ['AI search initialized.'],
    role_searched: searchMeta.role,
    skills_searched: searchMeta.skills,
    experience_searched: searchMeta.experience,
  });

  if (error) throw new Error(error.message);
}

export async function appendSearchLog(id, userId, message, client = supabase) {
  const { data, error: readError } = await client
    .from('ai_search_sessions')
    .select('logs')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (readError) return;

  const logs = [...(data?.logs || []), message];
  await client
    .from('ai_search_sessions')
    .update({ logs, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
}

export async function updateSearchSession(id, userId, patch, client = supabase) {
  const { error } = await client
    .from('ai_search_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

export async function getSearchSession(id, userId, client = supabase) {
  const { data, error } = await client
    .from('ai_search_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(error.message);
  }

  return data;
}

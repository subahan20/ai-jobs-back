import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Configuration Error] SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_KEY) are required.');
  process.exit(1);
}

// Service role bypasses RLS — use for admin jobs, AI search persistence, and auth verification.
export const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

// User-scoped client — passes the caller JWT so RLS policies (auth.uid()) apply correctly.
export const createUserSupabase = (accessToken) =>
  createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

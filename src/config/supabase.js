import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Configuration Error] Supabase URL and Key are required in environmental variables.');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

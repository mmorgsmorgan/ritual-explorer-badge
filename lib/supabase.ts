// Server-only Supabase client. Uses the service-role key for writes from the
// indexer / cron route. Never import this from a client component.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase-types';

let cached: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  // Read env at call time (not module top-level) so callers that load .env
  // files lazily (e.g. tsx scripts using dotenv) still get the values.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  if (!cached) {
    cached = createClient<Database>(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client with the service role (bypasses RLS).
 * Use only in Route Handlers / server code for curated public payloads (e.g. experience feed).
 * Never import from client components.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !key?.trim()) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

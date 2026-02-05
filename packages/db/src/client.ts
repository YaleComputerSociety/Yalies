import { createClient } from "@supabase/supabase-js";
import { env } from "@ycs/config";
import type { Database } from "./database.types.js";

/**
 * Supabase client with service role credentials (bypasses RLS).
 */
export const serviceClient = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Supabase client with anonymous credentials (RLS enforced).
 */
export const anonClient = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY
);

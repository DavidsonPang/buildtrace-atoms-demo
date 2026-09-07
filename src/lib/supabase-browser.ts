import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/src/lib/supabase-config";

let browserClient: SupabaseClient | null | undefined;

export function getSupabaseBrowserClient() {
  if (browserClient !== undefined) return browserClient;

  const config = getSupabasePublicConfig();
  browserClient = config
    ? createClient(config.url, config.publishableKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      })
    : null;

  return browserClient;
}

export function resetSupabaseBrowserClientForTests() {
  browserClient = undefined;
}

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/src/lib/supabase-config";

export type RunIdentity = {
  authRequired: boolean;
  userId: string | null;
};

export async function authenticateRunRequest(
  request: Request,
): Promise<RunIdentity> {
  const config = getSupabasePublicConfig();
  if (!config) return { authRequired: false, userId: null };

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { authRequired: true, userId: null };

  const client = createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await client.auth.getUser(match[1]);

  if (error || !data.user) return { authRequired: true, userId: null };
  return { authRequired: true, userId: data.user.id };
}

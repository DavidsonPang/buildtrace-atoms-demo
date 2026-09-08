import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/src/lib/supabase-config";

let browserClient: SupabaseClient | null | undefined;
export const SUPABASE_BROWSER_REQUEST_TIMEOUT_MS = 8_000;

export async function fetchSupabaseWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = SUPABASE_BROWSER_REQUEST_TIMEOUT_MS,
  fetcher: typeof fetch = fetch,
) {
  const controller = new AbortController();
  const upstreamSignal = init?.signal;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);

  if (upstreamSignal?.aborted) {
    abortFromUpstream();
  } else {
    upstreamSignal?.addEventListener("abort", abortFromUpstream, {
      once: true,
    });
  }

  const timeout = setTimeout(
    () => controller.abort(new DOMException("请求超时", "TimeoutError")),
    timeoutMs,
  );

  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}

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
        global: { fetch: fetchSupabaseWithTimeout },
      })
    : null;

  return browserClient;
}

export function resetSupabaseBrowserClientForTests() {
  browserClient = undefined;
}

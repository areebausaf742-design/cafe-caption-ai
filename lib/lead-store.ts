/**
 * Lead storage, as the service role.
 *
 * The contact form POSTs four short answers here; the row is the backup copy of
 * an enquiry whose real channel is WhatsApp. That ordering is why a failure here
 * is quiet for the visitor (the chat still opens) but not quiet for us: it is
 * reported honestly as a 503 rather than swallowed.
 *
 * `anon` has no INSERT grant on `public.leads`, and there is no fallback to the
 * publishable key — the only credentials that can write are the service role's.
 * Without them this module reports "not configured" and the route answers 503.
 */
import "server-only";

import type { LeadDraft } from "@/lib/leads";
import {
  supabaseEndpoint,
  supabaseWriteConfigured,
  writeHeaders,
} from "@/lib/supabase-config";

const TABLE = process.env.SUPABASE_LEADS_TABLE || "leads";

/** A slow database must not hold the function open until Vercel kills it. */
const TIMEOUT_MS = 5_000;

export function leadStoreConfigured(): boolean {
  return supabaseWriteConfigured();
}

export type LeadStoreResult =
  | { stored: true }
  | { stored: false; reason: "not-configured" | "upstream" };

/**
 * Insert one validated lead.
 *
 * Never throws, never retries: the caller has a WhatsApp handoff to fall back on,
 * and a lead stored twice is worse than a lead stored once. Nothing about the
 * request is logged — no IP, no headers, no key.
 */
export async function storeLead(
  lead: LeadDraft,
  pageUrl: string | null,
): Promise<LeadStoreResult> {
  if (!leadStoreConfigured()) {
    // `supabaseWriteConfigured()` has already logged which variable is wrong,
    // once. Repeating it per request would bury it.
    return { stored: false, reason: "not-configured" };
  }

  try {
    const response = await fetch(supabaseEndpoint(`/rest/v1/${TABLE}`), {
      method: "POST",
      headers: { ...writeHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({
        ...lead,
        source: "cafe-caption",
        page_url: pageUrl,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // Status + a short slice of PostgREST's own error text. Never the request,
      // never the headers: the Authorization value must not reach a log.
      const detail = await response.text().catch(() => "");
      console.error(
        "[leads] Supabase insert failed:",
        response.status,
        detail.slice(0, 200),
      );
      return { stored: false, reason: "upstream" };
    }

    return { stored: true };
  } catch (error) {
    console.error(
      "[leads] Supabase request failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return { stored: false, reason: "upstream" };
  }
}

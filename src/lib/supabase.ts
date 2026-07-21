/**
 * Minimal server-only Supabase (PostgREST) client.
 * Uses the service-role key: the ua_* tables have RLS enabled with no policies,
 * so they are unreachable with the anon key. Never import this from a client component.
 */
const URL_BASE = process.env.SUPABASE_URL?.trim() ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

// A leftover placeholder is worse than an empty value: it looks configured and
// then every call 401s, so treat it as "not configured".
const PLACEHOLDER = /^(paste|your|todo|change|xxx|<)/i;
export const supabaseConfigured = Boolean(
  URL_BASE && SERVICE_KEY && !PLACEHOLDER.test(SERVICE_KEY) && !PLACEHOLDER.test(URL_BASE),
);

export function supabaseStatus(): { configured: boolean; reason: string } {
  if (!URL_BASE) return { configured: false, reason: "SUPABASE_URL is not set." };
  if (!SERVICE_KEY) return { configured: false, reason: "SUPABASE_SERVICE_ROLE_KEY is not set." };
  if (PLACEHOLDER.test(SERVICE_KEY))
    return { configured: false, reason: "SUPABASE_SERVICE_ROLE_KEY is still the placeholder value." };
  return { configured: true, reason: "" };
}

function headers(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!supabaseConfigured) throw new Error("Supabase is not configured.");
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: headers(init?.headers as Record<string, string>),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

export function sbSelect<T>(table: string, query = ""): Promise<T[]> {
  return rest<T[]>(`${table}?${query}`);
}

export function sbUpsert<T>(table: string, rows: unknown, onConflict = "id"): Promise<T[]> {
  return rest<T[]>(`${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
}

export function sbInsert<T>(table: string, rows: unknown): Promise<T[]> {
  return rest<T[]>(table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
}

export function sbDelete(table: string, query: string): Promise<null> {
  return rest<null>(`${table}?${query}`, { method: "DELETE" });
}

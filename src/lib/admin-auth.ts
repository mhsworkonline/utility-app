/**
 * Password-based admin session.
 * Cookie value = `<expiry>.<HMAC-SHA256(expiry, ADMIN_PASSWORD)>` — signed so it
 * cannot be forged without the password. Web Crypto keeps this edge-compatible.
 */
export const ADMIN_COOKIE = "ua_admin";
const MAX_AGE_S = 60 * 60 * 8; // 8 hours

function secret(): string {
  return process.env.ADMIN_PASSWORD?.trim() ?? "";
}

export function adminConfigured(): boolean {
  return secret().length > 0;
}

async function hmac(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSession(): Promise<{ value: string; maxAge: number }> {
  const exp = String(Date.now() + MAX_AGE_S * 1000);
  return { value: `${exp}.${await hmac(exp)}`, maxAge: MAX_AGE_S };
}

export async function verifySession(cookie: string | undefined): Promise<boolean> {
  if (!cookie || !adminConfigured()) return false;
  const [exp, sig] = cookie.split(".");
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = await hmac(exp);
  // constant-time-ish comparison
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export function checkPassword(input: string): boolean {
  const s = secret();
  if (!s || input.length !== s.length) return false;
  let diff = 0;
  for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ input.charCodeAt(i);
  return diff === 0;
}

/** Show only the last 4 chars of a secret to the browser. */
export function mask(value: string): string {
  if (!value) return "";
  return value.length <= 8 ? "•".repeat(value.length) : `${value.slice(0, 6)}${"•".repeat(10)}${value.slice(-4)}`;
}

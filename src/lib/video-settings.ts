import { sbSelect, sbUpsert, supabaseConfigured } from "./supabase";

export interface VideoDownloaderSettings {
  /** Netscape-format cookies.txt contents, used for YouTube/Facebook/Instagram auth walls. */
  cookies: string;
}

let cache: { data: VideoDownloaderSettings; at: number } | null = null;
const TTL_MS = 60_000;

export function clearVideoSettingsCache() {
  cache = null;
}

/** Resolution order: DB (admin panel) only — no env/code fallback here, see video-download/route.ts for the full chain. */
export async function getVideoSettings(): Promise<VideoDownloaderSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  let raw: Record<string, unknown> = {};
  if (supabaseConfigured) {
    try {
      const rows = await sbSelect<{ value: Record<string, unknown> }>("ua_settings", "key=eq.video_downloader&select=value");
      raw = rows[0]?.value ?? {};
    } catch {
      /* fall through to empty */
    }
  }

  const data: VideoDownloaderSettings = { cookies: typeof raw.cookies === "string" ? raw.cookies : "" };
  cache = { data, at: Date.now() };
  return data;
}

export async function saveVideoSettings(next: VideoDownloaderSettings): Promise<void> {
  await sbUpsert("ua_settings", [{ key: "video_downloader", value: next, updated_at: new Date().toISOString() }], "key");
  clearVideoSettingsCache();
}

/**
 * IDs of recently-added apps, with the date they were added. Drives the
 * "New" badge on the homepage — an app is "new" for NEW_WINDOW_DAYS after
 * its date here. Prune old entries whenever you like; harmless to leave them,
 * they just stop rendering the badge once the window passes.
 */
export const NEW_SINCE: Record<string, string> = {
  "live-transcriber": "2026-08-11",
};

export const NEW_WINDOW_DAYS = 14;

export function isNewApp(id: string, now: Date = new Date()): boolean {
  const since = NEW_SINCE[id];
  if (!since) return false;
  const addedMs = new Date(since).getTime();
  if (Number.isNaN(addedMs)) return false;
  const ageDays = (now.getTime() - addedMs) / 86_400_000;
  return ageDays >= 0 && ageDays <= NEW_WINDOW_DAYS;
}

import { NextRequest, NextResponse } from "next/server";
import gplay from "google-play-scraper";

// Never cache: same reasoning as app-fetch — Apple's CDN and Next's data
// cache both hold stale versions/dates for hours.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const IOS_TIMEOUT = 15000;
const MAX_APP_TERMS = 10;     // "apps" mode: one exact lookup per term, cheap.
const MAX_COMPANY_TERMS = 5;  // "company"/"both": each term pulls a full catalog.

type Mode = "apps" | "company" | "both";

// A per-request cache-buster defeats Apple's edge cache (the URL becomes unique).
function bust() {
  return `_cb=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const NO_STORE: RequestInit = { cache: "no-store", headers: { "Cache-Control": "no-cache" } };

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}

// google-play-scraper returns summary/recentChanges as raw HTML fragments
// (entity-encoded text plus <br> tags) — decode before display so the UI
// doesn't re-escape them into literal "&amp;" / "&lt;br&gt;".
function decodeAndroidHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

// Map ESRB labels → IARC age numbers (what Play Store actually displays)
function mapAndroidRating(rating: string): string {
  switch (rating?.trim()) {
    case "Everyone":        return "3+";
    case "Everyone 10+":    return "10+";
    case "Teen":            return "12+";
    case "Mature 17+":      return "17+";
    case "Adults only 18+": return "18+";
    default:                return rating ?? "";
  }
}

interface IosApp {
  wrapperType: string;
  trackName: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  artistId?: number;
  artistName?: string;
  version?: string;
  currentVersionReleaseDate?: string;
  releaseNotes?: string;
  trackViewUrl?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  price?: number;
  primaryGenreName?: string;
  contentAdvisoryRating?: string;
  fileSizeBytes?: string;
  description?: string;
}

interface AndroidApp {
  title: string;
  icon?: string;
  url?: string;
  developer?: string;
  developerId?: string;
  version?: string;
  updated?: number;
  recentChanges?: string;
  score?: number;
  ratings?: number;
  installs?: string;
  price?: number;
  free?: boolean;
  genre?: string;
  contentRating?: string;
  size?: string;
  summary?: string;
}

type PlatformData = {
  version: string; releaseDate: string; url: string;
  rating: number | null; ratingCount: number | null;
  free: boolean; price: number;
  category: string; ageRating: string; size: string;
  description: string; releaseNotes: string; installs?: string;
};

type AppEntry = { name: string; icon: string; ios?: PlatformData; android?: PlatformData };

function iosToPlatform(app: IosApp): PlatformData {
  return {
    version:      app.version ?? "—",
    releaseDate:  app.currentVersionReleaseDate ?? "",
    url:          app.trackViewUrl ?? "",
    rating:       app.averageUserRating ?? null,
    ratingCount:  app.userRatingCount ?? null,
    free:         (app.price ?? 0) === 0,
    price:        app.price ?? 0,
    category:     app.primaryGenreName ?? "",
    ageRating:    app.contentAdvisoryRating ?? "",
    size:         app.fileSizeBytes ? formatBytes(parseInt(app.fileSizeBytes)) : "",
    description:  (app.description ?? "").slice(0, 200),
    releaseNotes: (app.releaseNotes ?? "").slice(0, 500),
  };
}

function androidToPlatform(app: AndroidApp): PlatformData {
  return {
    version:      app.version ?? "—",
    releaseDate:  app.updated ? new Date(app.updated).toISOString() : "",
    url:          app.url ?? "",
    rating:       app.score ?? null,
    ratingCount:  app.ratings ?? null,
    installs:     app.installs ?? "",
    free:         app.free ?? true,
    price:        app.price ?? 0,
    category:     app.genre ?? "",
    ageRating:    mapAndroidRating(app.contentRating ?? ""),
    size:         app.size ?? "",
    description:  decodeAndroidHtml(app.summary ?? "").slice(0, 200),
    releaseNotes: decodeAndroidHtml(app.recentChanges ?? "").slice(0, 500),
  };
}

// ── "Apps" mode: exact/closest single-app lookup per term ──────────────────────

async function iosAppSearch(term: string): Promise<IosApp[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&limit=5&country=us&${bust()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(IOS_TIMEOUT), ...NO_STORE });
  if (!res.ok) return [];
  const { results = [] } = await res.json();
  return results.filter((r: IosApp) => r.wrapperType === "software");
}

async function androidAppSearch(term: string): Promise<AndroidApp[]> {
  try {
    return await (gplay.search({
      term, num: 5, lang: "en", country: "us", fullDetail: true,
    }) as Promise<AndroidApp[]>);
  } catch {
    return [];
  }
}

function pickBest<T>(items: T[], term: string, nameOf: (t: T) => string): T | null {
  if (!items.length) return null;
  const qNorm = normalize(term);
  return items.find(i => normalize(nameOf(i)) === qNorm) ?? items[0];
}

async function appLookup(term: string): Promise<AppEntry | null> {
  const [iosRes, androidRes] = await Promise.allSettled([iosAppSearch(term), androidAppSearch(term)]);
  const iosApps     = iosRes.status     === "fulfilled" ? iosRes.value     : [];
  const androidApps = androidRes.status === "fulfilled" ? androidRes.value : [];

  const iosMatch     = pickBest(iosApps, term, a => a.trackName);
  const androidMatch = pickBest(androidApps, term, a => a.title);
  if (!iosMatch && !androidMatch) return null;

  return {
    name: iosMatch?.trackName ?? androidMatch?.title ?? term,
    icon: iosMatch?.artworkUrl100 ?? iosMatch?.artworkUrl60 ?? androidMatch?.icon ?? "",
    ios:     iosMatch     ? iosToPlatform(iosMatch)     : undefined,
    android: androidMatch ? androidToPlatform(androidMatch) : undefined,
  };
}

// ── "Company" mode: resolve the best-matching publisher, pull their full catalog ──

async function iosDevSearch(term: string): Promise<IosApp[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&limit=50&country=us&${bust()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(IOS_TIMEOUT), ...NO_STORE });
  if (!res.ok) return [];
  const { results = [] } = await res.json();
  return results.filter((r: IosApp) => r.wrapperType === "software");
}

async function androidDevSearch(term: string): Promise<AndroidApp[]> {
  try {
    return await (gplay.search({ term, num: 50, lang: "en", country: "us" }) as Promise<AndroidApp[]>);
  } catch {
    return [];
  }
}

// Rank candidate developer ids: exact name match first, then substring match,
// then the rest — each group sorted by how many search results carried that
// id (a stray/invalid id, from a store returning the same publisher under two
// encodings, usually only shows up attached to a single result). Returned as
// a ranked list rather than a single pick so a 404 on the top candidate can
// fall back to the next one instead of silently coming back empty.
function rankDeveloperIds<K>(entries: [K, { count: number; name: string }][], term: string): K[] {
  const qNorm  = normalize(term);
  const sorted = [...entries].sort((a, b) => b[1].count - a[1].count);
  const exact    = sorted.filter(([, d]) => normalize(d.name) === qNorm);
  const contains = sorted.filter(([, d]) => normalize(d.name) !== qNorm && normalize(d.name).includes(qNorm));
  const rest     = sorted.filter(([, d]) => !normalize(d.name).includes(qNorm));
  return [...exact, ...contains, ...rest].map(([k]) => k);
}

function rankIosDevelopers(results: IosApp[], term: string): number[] {
  const devMap = new Map<number, { count: number; name: string }>();
  for (const r of results) {
    if (r.artistId == null) continue;
    if (!devMap.has(r.artistId)) devMap.set(r.artistId, { count: 0, name: r.artistName ?? "" });
    devMap.get(r.artistId)!.count++;
  }
  return rankDeveloperIds([...devMap.entries()], term);
}

function rankAndroidDevelopers(results: AndroidApp[], term: string): string[] {
  const devMap = new Map<string, { count: number; name: string }>();
  for (const r of results) {
    const devId = r.developerId || r.developer;
    if (!devId) continue;
    if (!devMap.has(devId)) devMap.set(devId, { count: 0, name: r.developer ?? "" });
    devMap.get(devId)!.count++;
  }
  return rankDeveloperIds([...devMap.entries()], term);
}

async function iosFullCatalog(artistId: number): Promise<IosApp[]> {
  const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=software&limit=200&country=us&${bust()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(IOS_TIMEOUT), ...NO_STORE });
  if (!res.ok) return [];
  const { results = [] } = await res.json();
  return results.filter((r: IosApp) => r.wrapperType === "software");
}

async function androidFullCatalog(devId: string): Promise<AndroidApp[]> {
  try {
    return await (gplay.developer({
      devId, num: 250, lang: "en", country: "us", fullDetail: true,
    }) as Promise<AndroidApp[]>);
  } catch {
    return [];
  }
}

const MAX_DEV_ATTEMPTS = 2; // try the top-ranked id, then one fallback, before giving up.

async function firstNonEmptyCatalog<K>(ids: K[], fetchCatalog: (id: K) => Promise<unknown[]>): Promise<unknown[]> {
  for (const id of ids.slice(0, MAX_DEV_ATTEMPTS)) {
    const catalog = await fetchCatalog(id);
    if (catalog.length) return catalog;
  }
  return [];
}

async function companyLookup(term: string): Promise<AppEntry[]> {
  const [iosSearchRes, androidSearchRes] = await Promise.allSettled([iosDevSearch(term), androidDevSearch(term)]);
  const iosSearch     = iosSearchRes.status     === "fulfilled" ? iosSearchRes.value     : [];
  const androidSearch = androidSearchRes.status === "fulfilled" ? androidSearchRes.value : [];

  const iosArtistIds  = rankIosDevelopers(iosSearch, term);
  const androidDevIds = rankAndroidDevelopers(androidSearch, term);

  const [iosApps, androidApps] = await Promise.all([
    firstNonEmptyCatalog(iosArtistIds, iosFullCatalog) as Promise<IosApp[]>,
    firstNonEmptyCatalog(androidDevIds, androidFullCatalog) as Promise<AndroidApp[]>,
  ]);

  const appMap = new Map<string, AppEntry>();
  for (const app of iosApps) {
    appMap.set(normalize(app.trackName), {
      name: app.trackName,
      icon: app.artworkUrl100 ?? app.artworkUrl60 ?? "",
      ios: iosToPlatform(app),
    });
  }
  for (const app of androidApps) {
    const key = normalize(app.title);
    const ex  = appMap.get(key);
    if (ex) {
      ex.android = androidToPlatform(app);
      if (!ex.icon && app.icon) ex.icon = app.icon;
    } else {
      appMap.set(key, { name: app.title, icon: app.icon ?? "", android: androidToPlatform(app) });
    }
  }
  return [...appMap.values()];
}

// ── Request handling ─────────────────────────────────────────────────────────

function parseTerms(raw: string, max: number): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(t);
    if (terms.length >= max) break;
  }
  return terms;
}

function mergeEntries(entries: AppEntry[]): AppEntry[] {
  const merged = new Map<string, AppEntry>();
  for (const entry of entries) {
    const key = normalize(entry.name);
    const ex  = merged.get(key);
    if (ex) {
      if (!ex.ios && entry.ios) ex.ios = entry.ios;
      if (!ex.android && entry.android) ex.android = entry.android;
      if (!ex.icon && entry.icon) ex.icon = entry.icon;
    } else {
      merged.set(key, { ...entry });
    }
  }
  return [...merged.values()];
}

export async function GET(req: NextRequest) {
  const raw     = req.nextUrl.searchParams.get("q") ?? "";
  const modeRaw = req.nextUrl.searchParams.get("mode");
  const mode: Mode = modeRaw === "company" || modeRaw === "both" ? modeRaw : "apps";

  const max   = mode === "apps" ? MAX_APP_TERMS : MAX_COMPANY_TERMS;
  const terms = parseTerms(raw, max);

  if (!terms.length)
    return NextResponse.json({ error: "Provide at least one app or company name." }, { status: 400 });

  const entries: AppEntry[] = [];

  if (mode === "apps" || mode === "both") {
    const results = await Promise.all(terms.map(appLookup));
    for (const r of results) if (r) entries.push(r);
  }
  if (mode === "company" || mode === "both") {
    const results = await Promise.all(terms.map(companyLookup));
    for (const list of results) entries.push(...list);
  }

  return NextResponse.json(
    { apps: mergeEntries(entries) },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "CDN-Cache-Control": "no-store" } },
  );
}

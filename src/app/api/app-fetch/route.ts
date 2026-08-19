import { NextRequest, NextResponse } from "next/server";
import gplay from "google-play-scraper";

// Never cache: Apple's iTunes CDN and Next's data cache both hold stale results
// for hours, which is why refreshes showed old versions/dates.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const IOS_TIMEOUT = 15000;

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
    case "Everyone":          return "3+";
    case "Everyone 10+":      return "10+";
    case "Teen":              return "12+";
    case "Mature 17+":        return "17+";
    case "Adults only 18+":   return "18+";
    default:                  return rating ?? "";
  }
}

interface IosApp {
  wrapperType: string;
  trackName: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
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
  appId: string;
  url: string;
  icon: string;
  version: string;
  updated: number;
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

async function fetchIosByArtistId(artistId: string): Promise<IosApp[]> {
  const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=software&limit=200&country=us&${bust()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(IOS_TIMEOUT), ...NO_STORE });
  if (!res.ok) return [];
  const { results = [] } = await res.json();
  return results.filter((r: IosApp) => r.wrapperType === "software");
}

async function fetchIosByDevName(devName: string): Promise<IosApp[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(devName)}&entity=software&attribute=softwareDeveloper&limit=200&country=us&${bust()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(IOS_TIMEOUT), ...NO_STORE });
  if (!res.ok) return [];
  const { results = [] } = await res.json();
  return results.filter((r: IosApp) => r.wrapperType === "software");
}

async function fetchAndroid(devId: string): Promise<AndroidApp[]> {
  return gplay.developer({ devId, num: 250, lang: "en", country: "us", fullDetail: true }) as Promise<AndroidApp[]>;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const iosId     = searchParams.get("iosId");
  const androidId = searchParams.get("androidId");
  const devName   = searchParams.get("devName") ?? "";

  if (!iosId && !androidId && !devName)
    return NextResponse.json({ error: "Provide iosId, androidId, or devName." }, { status: 400 });

  const [iosRes, androidRes] = await Promise.allSettled([
    iosId     ? fetchIosByArtistId(iosId) : devName ? fetchIosByDevName(devName) : Promise.resolve([]),
    androidId ? fetchAndroid(androidId)   : Promise.resolve([]),
  ]);

  const iosApps     = iosRes.status     === "fulfilled" ? iosRes.value     : [];
  const androidApps = androidRes.status === "fulfilled" ? androidRes.value : [];

  type PlatformData = {
    version: string; releaseDate: string; url: string;
    rating: number | null; ratingCount: number | null;
    free: boolean; price: number;
    category: string; ageRating: string; size: string;
    description: string; releaseNotes: string; installs?: string;
  };

  const appMap = new Map<string, {
    name: string; icon: string; sortDate: number;
    ios?: PlatformData; android?: PlatformData;
  }>();

  for (const app of iosApps) {
    const releaseDate = app.currentVersionReleaseDate ?? "";
    appMap.set(normalize(app.trackName), {
      name: app.trackName,
      icon: app.artworkUrl100 ?? app.artworkUrl60 ?? "",
      sortDate: releaseDate ? new Date(releaseDate).getTime() : 0,
      ios: {
        version:     app.version ?? "—",
        releaseDate,
        url:         app.trackViewUrl ?? "",
        rating:      app.averageUserRating ?? null,
        ratingCount: app.userRatingCount ?? null,
        free:        (app.price ?? 0) === 0,
        price:       app.price ?? 0,
        category:    app.primaryGenreName ?? "",
        ageRating:   app.contentAdvisoryRating ?? "",
        size:        app.fileSizeBytes ? formatBytes(parseInt(app.fileSizeBytes)) : "",
        description: (app.description ?? "").slice(0, 200),
        releaseNotes: (app.releaseNotes ?? "").slice(0, 500),
      },
    });
  }

  for (const app of androidApps) {
    const releaseDate = app.updated ? new Date(app.updated).toISOString() : "";
    const sortDate    = app.updated ?? 0;
    const androidData: PlatformData = {
      version:     app.version ?? "—",
      releaseDate,
      url:         app.url ?? "",
      rating:      app.score ?? null,
      ratingCount: app.ratings ?? null,
      installs:    app.installs ?? "",
      free:        app.free ?? true,
      price:       app.price ?? 0,
      category:    app.genre ?? "",
      ageRating:   mapAndroidRating(app.contentRating ?? ""),
      size:        app.size ?? "",
      description: decodeAndroidHtml(app.summary ?? "").slice(0, 200),
      releaseNotes: decodeAndroidHtml(app.recentChanges ?? "").slice(0, 500),
    };
    const key = normalize(app.title);
    const ex  = appMap.get(key);
    if (ex) {
      ex.android = androidData;
      if (sortDate > ex.sortDate) ex.sortDate = sortDate;
      if (!ex.icon && app.icon) ex.icon = app.icon;
    } else {
      appMap.set(key, { name: app.title, icon: app.icon ?? "", sortDate, android: androidData });
    }
  }

  const apps = [...appMap.values()]
    .sort((a, b) => b.sortDate - a.sortDate)
    .map(({ sortDate: _s, ...rest }) => rest);

  return NextResponse.json(
    { devName, apps },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "CDN-Cache-Control": "no-store" } },
  );
}

import { NextRequest, NextResponse } from "next/server";
import gplay from "google-play-scraper";

const IOS_TIMEOUT = 15000;

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}

interface IosApp {
  wrapperType: string;
  trackName: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  version?: string;
  currentVersionReleaseDate?: string;
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
  const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=software&limit=200&country=us`;
  const res = await fetch(url, { signal: AbortSignal.timeout(IOS_TIMEOUT) });
  if (!res.ok) return [];
  const { results = [] } = await res.json();
  return results.filter((r: IosApp) => r.wrapperType === "software");
}

async function fetchIosByDevName(devName: string): Promise<IosApp[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(devName)}&entity=software&attribute=softwareDeveloper&limit=200&country=us`;
  const res = await fetch(url, { signal: AbortSignal.timeout(IOS_TIMEOUT) });
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
    description: string; installs?: string;
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
      ageRating:   app.contentRating ?? "",
      size:        app.size ?? "",
      description: (app.summary ?? "").slice(0, 200),
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

  return NextResponse.json({ devName, apps });
}

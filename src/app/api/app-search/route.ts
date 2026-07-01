import { NextRequest, NextResponse } from "next/server";
import gplay from "google-play-scraper";

const IOS_TIMEOUT = 10000;

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface IosApp {
  trackName: string; artworkUrl100?: string; artworkUrl60?: string;
  artistName: string; artistId: number; version?: string;
  currentVersionReleaseDate?: string; trackViewUrl?: string;
}
interface AndroidApp {
  title: string; icon?: string; developer: string;
  developerId?: string; url?: string;
}

async function iosSearch(q: string) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=software&limit=100&country=us`;
  const res = await fetch(url, { signal: AbortSignal.timeout(IOS_TIMEOUT) });
  if (!res.ok) return { devs: [], apps: [] };
  const { results = [] }: { results: IosApp[] } = await res.json();

  const devMap = new Map<number, { name: string; artistId: number; count: number }>();
  for (const app of results) {
    if (!devMap.has(app.artistId))
      devMap.set(app.artistId, { name: app.artistName, artistId: app.artistId, count: 0 });
    devMap.get(app.artistId)!.count++;
  }

  return {
    devs: [...devMap.values()].sort((a, b) => b.count - a.count),
    apps: results.map(app => ({
      name: app.trackName,
      icon: app.artworkUrl100 ?? app.artworkUrl60 ?? "",
      developer: app.artistName,
      ios: {
        version: app.version ?? "—",
        releaseDate: app.currentVersionReleaseDate ?? "",
        url: app.trackViewUrl ?? "",
      },
    })),
  };
}

async function androidSearch(q: string) {
  const results = await (gplay.search({ term: q, num: 100, lang: "en", country: "us" }) as Promise<AndroidApp[]>);

  const devMap = new Map<string, { name: string; devId: string; count: number }>();
  for (const app of results) {
    const devId = app.developerId || app.developer;
    if (!devMap.has(devId))
      devMap.set(devId, { name: app.developer, devId, count: 0 });
    devMap.get(devId)!.count++;
  }

  return {
    devs: [...devMap.values()].sort((a, b) => b.count - a.count),
    apps: results.map(app => ({
      name: app.title,
      icon: app.icon ?? "",
      developer: app.developer,
      android: { version: "—", releaseDate: "", url: app.url ?? "" },
    })),
  };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ error: "Query too short." }, { status: 400 });

  const [iosRes, androidRes] = await Promise.allSettled([iosSearch(q), androidSearch(q)]);

  const ios     = iosRes.status     === "fulfilled" ? iosRes.value     : { devs: [], apps: [] };
  const android = androidRes.status === "fulfilled" ? androidRes.value : { devs: [], apps: [] };

  // ── Merge developers ──────────────────────────────────────────────────────
  const devMap = new Map<string, {
    name: string; iosArtistId?: number; androidDevId?: string;
    iosCount: number; androidCount: number;
  }>();

  for (const d of ios.devs) {
    devMap.set(normalize(d.name), { name: d.name, iosArtistId: d.artistId, iosCount: d.count, androidCount: 0 });
  }
  for (const d of android.devs) {
    const key = normalize(d.name);
    const ex  = devMap.get(key);
    if (ex) { ex.androidDevId = d.devId; ex.androidCount = d.count; }
    else devMap.set(key, { name: d.name, androidDevId: d.devId, iosCount: 0, androidCount: d.count });
  }

  const qNorm = normalize(q);

  const developers = [...devMap.values()]
    .filter(d => {
      const total = d.iosCount + d.androidCount;
      // Always include if the developer name itself contains the query
      if (normalize(d.name).includes(qNorm)) return true;
      // Otherwise require at least 2 matching apps (filters one-off noise)
      return total >= 2;
    })
    .sort((a, b) => (b.iosCount + b.androidCount) - (a.iosCount + a.androidCount))
    .slice(0, 15);

  // ── Merge direct app matches (top 10) ─────────────────────────────────────
  const appMap = new Map<string, {
    name: string; icon: string; developer: string;
    ios?: { version: string; releaseDate: string; url: string };
    android?: { version: string; releaseDate: string; url: string };
  }>();

  for (const app of ios.apps) {
    appMap.set(normalize(app.name), { name: app.name, icon: app.icon, developer: app.developer, ios: app.ios });
  }
  for (const app of android.apps) {
    const key = normalize(app.name);
    const ex  = appMap.get(key);
    if (ex) { ex.android = app.android; if (!ex.icon && app.icon) ex.icon = app.icon; }
    else appMap.set(key, { name: app.name, icon: app.icon, developer: app.developer, android: app.android });
  }

  const apps = [...appMap.values()].slice(0, 10);

  return NextResponse.json({ developers, apps });
}

import { NextRequest, NextResponse } from "next/server";
import gplay from "google-play-scraper";

const IOS_TIMEOUT = 15000;

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchIos(artistId: string) {
  const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=software&limit=200&country=us`;
  const res = await fetch(url, { signal: AbortSignal.timeout(IOS_TIMEOUT) });
  if (!res.ok) return [];
  const { results = [] } = await res.json();
  return results.filter((r: { wrapperType: string }) => r.wrapperType === "software");
}

async function fetchAndroid(devId: string) {
  return gplay.developer({ devId, num: 250, lang: "en", country: "us", fullDetail: true }) as Promise<{
    title: string; appId: string; url: string; icon: string;
    version: string; updated: number;
  }[]>;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const iosId    = searchParams.get("iosId");
  const androidId = searchParams.get("androidId");
  const devName  = searchParams.get("devName") ?? "";

  if (!iosId && !androidId)
    return NextResponse.json({ error: "Provide iosId or androidId." }, { status: 400 });

  const [iosRes, androidRes] = await Promise.allSettled([
    iosId     ? fetchIos(iosId)         : Promise.resolve([]),
    androidId ? fetchAndroid(androidId) : Promise.resolve([]),
  ]);

  const iosApps     = iosRes.status     === "fulfilled" ? iosRes.value     : [];
  const androidApps = androidRes.status === "fulfilled" ? androidRes.value : [];

  const appMap = new Map<string, {
    name: string;
    icon: string;
    sortDate: number;
    ios?:     { version: string; releaseDate: string; url: string };
    android?: { version: string; releaseDate: string; url: string };
  }>();

  for (const app of iosApps) {
    const key = normalize(app.trackName);
    const releaseDate: string = app.currentVersionReleaseDate ?? "";
    appMap.set(key, {
      name: app.trackName,
      icon: app.artworkUrl100 ?? app.artworkUrl60 ?? "",
      sortDate: releaseDate ? new Date(releaseDate).getTime() : 0,
      ios: {
        version: app.version ?? "—",
        releaseDate,
        url: app.trackViewUrl ?? "",
      },
    });
  }

  for (const app of androidApps) {
    const key = normalize(app.title);
    const releaseDate = app.updated ? new Date(app.updated).toISOString() : "";
    const sortDate    = app.updated ?? 0;
    const androidData = {
      version: app.version ?? "—",
      releaseDate,
      url: app.url ?? "",
    };
    const ex = appMap.get(key);
    if (ex) {
      ex.android = androidData;
      if (sortDate > ex.sortDate) ex.sortDate = sortDate;
      if (!ex.icon && app.icon) ex.icon = app.icon;
    } else {
      appMap.set(key, {
        name: app.title,
        icon: app.icon ?? "",
        sortDate,
        android: androidData,
      });
    }
  }

  const apps = [...appMap.values()]
    .sort((a, b) => b.sortDate - a.sortDate)
    .map(({ sortDate: _s, ...rest }) => rest);

  return NextResponse.json({ devName, apps });
}

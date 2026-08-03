import { NextRequest, NextResponse } from "next/server";
import { getVideoSettings, saveVideoSettings } from "@/lib/video-settings";

// Cookies are login credentials — never echo the stored value back to the browser.
export async function GET() {
  try {
    const s = await getVideoSettings();
    const lines = s.cookies.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    return NextResponse.json({ has_cookies: Boolean(s.cookies), cookie_count: lines.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { cookies?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  try {
    await saveVideoSettings({ cookies: (body.cookies ?? "").trim() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

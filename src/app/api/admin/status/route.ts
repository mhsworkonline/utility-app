import { NextResponse } from "next/server";
import { sbSelect, supabaseStatus } from "@/lib/supabase";

/** Tells the panel whether settings can actually be persisted. */
export async function GET() {
  const { configured, reason } = supabaseStatus();
  if (!configured) return NextResponse.json({ ok: false, reason });

  try {
    await sbSelect("ua_settings", "select=key&limit=1");
    return NextResponse.json({ ok: true, reason: "" });
  } catch (err) {
    return NextResponse.json({ ok: false, reason: (err as Error).message.slice(0, 200) });
  }
}

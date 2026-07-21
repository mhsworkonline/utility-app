import { NextRequest, NextResponse } from "next/server";
import { sbSelect, sbUpsert, sbDelete } from "@/lib/supabase";
import type { App } from "@/data/apps";

export async function GET() {
  try {
    const rows = await sbSelect<App>("ua_apps", "select=*&order=sort_order.asc");
    return NextResponse.json({ apps: rows });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { apps?: App[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!Array.isArray(body.apps))
    return NextResponse.json({ error: "Expected { apps: [...] }" }, { status: 400 });

  const rows = body.apps.map((a, i) => ({
    id: String(a.id ?? "").trim(),
    name: String(a.name ?? "").trim(),
    description: String(a.description ?? "").trim(),
    url: String(a.url ?? "").trim(),
    icon: String(a.icon ?? "").trim(),
    tags: Array.isArray(a.tags) ? a.tags : [],
    sort_order: typeof a.sort_order === "number" ? a.sort_order : i + 1,
    status: ["visible", "hidden", "maintenance"].includes(a.status ?? "") ? a.status : "visible",
    updated_at: new Date().toISOString(),
  }));
  if (rows.some((r) => !r.id || !r.name || !r.url))
    return NextResponse.json({ error: "Each app needs an id, name and url." }, { status: 400 });

  try {
    await sbUpsert("ua_apps", rows, "id");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await sbDelete("ua_apps", `id=eq.${encodeURIComponent(id)}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

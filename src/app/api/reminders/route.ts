import { NextRequest, NextResponse } from "next/server";
import { sbSelect, sbUpsert, sbDelete } from "@/lib/supabase";

export interface ReminderRow {
  id: string;
  label: string;
  start_at: string;
  end_at: string;
  interval_value: number;
  interval_unit: "minutes" | "hours" | "days";
  sound: string;
  enabled: boolean;
  next_due: string;
  status: "active" | "off" | "finished";
}

// All reminders are visible to every subscribed device — this app has no
// accounts, so "yours" just means "set from this browser or any other".
export async function GET() {
  try {
    const rows = await sbSelect<ReminderRow>("ua_reminders", "select=*&order=next_due.asc");
    return NextResponse.json({ reminders: rows });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { reminder?: Partial<ReminderRow> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const r = body.reminder;
  if (!r || !r.id || !r.label || !r.start_at || !r.end_at || !r.interval_value || !r.interval_unit || !r.next_due) {
    return NextResponse.json({ error: "Missing required reminder fields." }, { status: 400 });
  }

  const row: ReminderRow = {
    id: r.id,
    label: String(r.label).slice(0, 200),
    start_at: r.start_at,
    end_at: r.end_at,
    interval_value: Math.max(1, Math.round(r.interval_value)),
    interval_unit: r.interval_unit,
    sound: r.sound || "classic",
    enabled: r.enabled !== false,
    next_due: r.next_due,
    status: r.status || "active",
  };

  try {
    await sbUpsert("ua_reminders", [row], "id");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await sbDelete("ua_reminders", `id=eq.${encodeURIComponent(id)}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

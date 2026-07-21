import { NextResponse } from "next/server";
import { sbSelect, sbDelete } from "@/lib/supabase";

export async function GET() {
  try {
    const rows = await sbSelect<{ id: number; app: string; message: string; created_at: string }>(
      "ua_error_log",
      "select=*&order=created_at.desc&limit=50",
    );
    return NextResponse.json({ errors: rows });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await sbDelete("ua_error_log", "id=gt.0");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

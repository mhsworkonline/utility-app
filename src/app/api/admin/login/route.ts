import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminConfigured, checkPassword, createSession } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  if (!adminConfigured())
    return NextResponse.json(
      { error: "ADMIN_PASSWORD is not set on the server." },
      { status: 500 },
    );

  let body: { password?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  if (!checkPassword(body.password ?? ""))
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });

  const { value, maxAge } = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return res;
}

import { NextRequest, NextResponse } from "next/server";
import { getAiSettings, saveAiSettings, clearSettingsCache, EMPTY_KEYS, type AiSettings, type AppModelCfg, type ProviderKeys } from "@/lib/settings";
import { PROVIDERS, isProvider } from "@/lib/providers";
import { mask } from "@/lib/admin-auth";

export async function GET() {
  try {
    const s = await getAiSettings();
    const masked: Record<string, string> = {};
    const present: Record<string, boolean> = {};
    for (const p of PROVIDERS) {
      masked[p.id] = mask(s.keys[p.id]);
      present[p.id] = Boolean(s.keys[p.id]);
    }
    // Real keys never leave the server.
    return NextResponse.json({ ...s, keys: masked, has_key: present });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Partial<AiSettings>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  try {
    const current = await getAiSettings();

    // A masked or blank value means "keep the stored key".
    const keys: ProviderKeys = { ...EMPTY_KEYS };
    for (const p of PROVIDERS) {
      const incoming = (body.keys?.[p.id] ?? "").trim();
      keys[p.id] = !incoming || incoming.includes("•") ? current.keys[p.id] : incoming;
    }

    const clean = (m: Partial<AppModelCfg> | undefined, fallback: AppModelCfg): AppModelCfg => ({
      provider: isProvider(m?.provider) ? m.provider : fallback.provider,
      model: (m?.model ?? fallback.model).trim(),
      max_tokens: Number(m?.max_tokens) || fallback.max_tokens,
      temperature: Number.isFinite(Number(m?.temperature)) ? Number(m!.temperature) : fallback.temperature,
      reasoning_effort: (m?.reasoning_effort ?? fallback.reasoning_effort).trim(),
    });

    await saveAiSettings({
      keys,
      analyze: clean(body.analyze, current.analyze),
      lab_report: clean(body.lab_report, current.lab_report),
    });
    clearSettingsCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

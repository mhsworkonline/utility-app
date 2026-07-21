import { NextResponse } from "next/server";
import { getAiSettings } from "@/lib/settings";
import { sbSelect, supabaseConfigured } from "@/lib/supabase";
import { listModels, PROVIDERS } from "@/lib/providers";

type Tile = { name: string; ok: boolean; detail: string };

async function timed(name: string, fn: () => Promise<string>): Promise<Tile> {
  const t = Date.now();
  try {
    return { name, ok: true, detail: `${await fn()} · ${Date.now() - t}ms` };
  } catch (err) {
    return { name, ok: false, detail: (err as Error).message.slice(0, 160) };
  }
}

export async function GET() {
  const s = await getAiSettings();
  const modelCache = new Map<string, string[]>();

  const models = async (provider: (typeof PROVIDERS)[number]["id"]) => {
    if (!modelCache.has(provider)) modelCache.set(provider, await listModels(provider, s.keys[provider]));
    return modelCache.get(provider)!;
  };

  const checks: Promise<Tile>[] = [
    timed("Supabase", async () => {
      if (!supabaseConfigured) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY not set");
      await sbSelect("ua_settings", "select=key&limit=1");
      return "connected";
    }),
  ];

  // Only check providers that actually have a key saved.
  for (const p of PROVIDERS) {
    if (!s.keys[p.id]) continue;
    checks.push(timed(`${p.label} key`, async () => `${(await models(p.id)).length} models available`));
  }

  for (const [label, cfg] of [["Analyzer model", s.analyze], ["Lab report model", s.lab_report]] as const) {
    checks.push(
      timed(label, async () => {
        if (!s.keys[cfg.provider]) throw new Error(`No API key saved for ${cfg.provider}`);
        const list = await models(cfg.provider);
        if (!list.includes(cfg.model.replace(/^models\//, "")) && !list.includes(cfg.model))
          throw new Error(`"${cfg.model}" not available on the ${cfg.provider} key`);
        return `${cfg.provider} · ${cfg.model}`;
      }),
    );
  }

  checks.push(
    timed("iTunes Search API", async () => {
      const r = await fetch("https://itunes.apple.com/search?term=test&entity=software&limit=1", {
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return "reachable";
    }),
  );

  return NextResponse.json({ tiles: await Promise.all(checks) });
}

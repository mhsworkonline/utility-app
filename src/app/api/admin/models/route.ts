import { NextRequest, NextResponse } from "next/server";
import { getAiSettings } from "@/lib/settings";
import { listModels, isProvider } from "@/lib/providers";

/** Live list of models the saved key for `provider` can actually use. */
export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");
  if (!isProvider(provider))
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });

  const { keys } = await getAiSettings();
  const apiKey = keys[provider];
  if (!apiKey)
    return NextResponse.json({ error: `No API key saved for ${provider}.` }, { status: 400 });

  try {
    return NextResponse.json({ models: await listModels(provider, apiKey) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

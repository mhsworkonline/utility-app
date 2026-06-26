import { NextRequest, NextResponse } from "next/server";
import { readdirSync, unlinkSync } from "fs";
import { readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("k") ?? "";
  const filename = searchParams.get("fn") ?? "download";

  if (!key || !/^[\w-]+$/.test(key)) {
    return new NextResponse("Invalid key.", { status: 400 });
  }

  const tmp = tmpdir();
  const prefix = `yt_${key}`;
  let filePath: string | null = null;

  try {
    const match = readdirSync(tmp).find(f => f.startsWith(prefix));
    if (match) filePath = join(tmp, match);
  } catch {
    return new NextResponse("Could not read temp directory.", { status: 500 });
  }

  if (!filePath) {
    return new NextResponse(
      `Download not found (key: ${key}). It may have expired or the file was not created.`,
      { status: 404 }
    );
  }

  const ext = (filePath.split(".").pop() ?? "mp4").toLowerCase();
  const contentType = ext === "mp3" ? "audio/mpeg" : "video/mp4";

  // HTTP headers are ByteString (0–255 only). Use RFC 5987 for Unicode filenames:
  //   filename=  ASCII fallback (non-ASCII replaced with _)
  //   filename*= UTF-8 percent-encoded value for browsers that support it
  const asciiName = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const disposition = `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`;

  try {
    const buffer = await readFile(filePath);
    try { unlinkSync(filePath); } catch {}

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err) {
    return new NextResponse(`Failed to read file: ${(err as Error).message}`, { status: 500 });
  }
}

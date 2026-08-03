import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // yt-dlp/ffmpeg binaries are spawned via child_process, so Next's static
  // import tracing can't see them — include them explicitly for Netlify.
  outputFileTracingIncludes: {
    "/api/video-download": ["./bin/**/*", "./node_modules/ffmpeg-static/**/*"],
  },
};

export default nextConfig;

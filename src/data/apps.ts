import { sbSelect, supabaseConfigured } from "@/lib/supabase";

export interface App {
  id: string;
  name: string;
  description: string;
  url: string;
  icon?: string;
  thumbnail?: string;
  tags?: string[];
  sort_order?: number;
  status?: "visible" | "hidden" | "maintenance";
}

/**
 * Fallback catalog used only if Supabase is unreachable/unconfigured,
 * so the homepage never renders empty. The admin panel is the source of truth.
 */
export const fallbackApps: App[] = [
  { id: "xray-identifier", name: "Medical Image Analyzer", description: "Upload an X-Ray, CT Scan, or MRI image and get a detailed AI-powered radiological analysis with findings and recommendations.", url: "/xray-analyzer.html", icon: "scan", tags: ["AI", "Medical"] },
  { id: "otc-medicine", name: "OTC Medicine Guide", description: "A visual infographic reference for over-the-counter medications, dosages, and usage guidelines.", url: "/otc_medicine_infographic.html", icon: "pill", tags: ["Health", "Reference"] },
  { id: "unit-converter", name: "Unit Converter", description: "Quickly convert between units of length, weight, temperature, volume, land area, and more.", url: "/unit_converter.html", icon: "ruler", tags: ["Utility"] },
  { id: "lab-report", name: "Lab Report Analysis", description: "Upload a lab report PDF or image and get an AI-generated summary with flagged values and recommendations.", url: "/lab-report.html", icon: "clipboard", tags: ["AI", "Medical"] },
  { id: "app-lookup", name: "App Store Lookup", description: "Search a company name to discover all their iOS and Android apps with versions and last release dates.", url: "/app-lookup.html", icon: "store", tags: ["Utility", "Research"] },
  { id: "video-downloader", name: "Video Downloader", description: "Paste a YouTube, Instagram, or Facebook video URL to download as MP4 (360p–1080p) or MP3. Max 100 MB.", url: "/video-downloader.html", icon: "video", tags: ["Utility", "Media"] },
  { id: "myexcel", name: "Excel Spreadsheet", description: "A full-featured spreadsheet app with formula engine, cell formatting, multiple sheets, and export to CSV, XLSX, and PDF.", url: "/myexcel.html", icon: "table", tags: ["Utility", "Productivity"] },
  { id: "whiteboard", name: "Whiteboard", description: "An infinite pannable canvas for freehand drawing, sticky notes, text, and shapes — with pen, highlighter, eraser, and undo/redo.", url: "/whiteboard.html", icon: "whiteboard", tags: ["Utility", "Productivity"] },
  { id: "screen-recorder", name: "Screen Recorder", description: "Record your screen, window, or tab with optional mic and system audio — then preview and download. Runs entirely in your browser, nothing is uploaded.", url: "/screen-recorder.html", icon: "record", tags: ["Utility", "Media"] },
  { id: "live-transcriber", name: "Live Transcriber", description: "Transcribe audio from a video playing in another tab (like YouTube), an uploaded file, or your microphone — then save the transcript as TXT, SRT, or VTT.", url: "/live-transcriber.html", icon: "mic", tags: ["Utility", "Media"] },
];

/** Server-side catalog fetch. Hidden apps are never returned to the homepage. */
export async function getApps(): Promise<App[]> {
  if (!supabaseConfigured) return fallbackApps;
  try {
    const rows = await sbSelect<App>("ua_apps", "select=*&status=neq.hidden&order=sort_order.asc");
    return rows.length ? rows : fallbackApps;
  } catch {
    return fallbackApps;
  }
}

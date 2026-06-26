export interface App {
  id: string;
  name: string;
  description: string;
  url: string;
  icon?: string;
  thumbnail?: string;
  tags?: string[];
}

export const apps: App[] = [
  {
    id: "xray-identifier",
    name: "Medical Image Analyzer",
    description: "Upload an X-Ray, CT Scan, or MRI image and get a detailed AI-powered radiological analysis with findings and recommendations.",
    url: "/xray-analyzer.html",
    icon: "scan",
    tags: ["AI", "Medical"],
  },
  {
    id: "otc-medicine",
    name: "OTC Medicine Guide",
    description: "A visual infographic reference for over-the-counter medications, dosages, and usage guidelines.",
    url: "/otc_medicine_infographic.html",
    icon: "pill",
    tags: ["Health", "Reference"],
  },
  {
    id: "unit-converter",
    name: "Unit Converter",
    description: "Quickly convert between units of length, weight, temperature, volume, land area, and more.",
    url: "/unit_converter.html",
    icon: "ruler",
    tags: ["Utility"],
  },
  {
    id: "lab-report",
    name: "Lab Report Analysis",
    description: "Upload a lab report PDF or image and get an AI-generated summary with flagged values and recommendations.",
    url: "/lab-report.html",
    icon: "clipboard",
    tags: ["AI", "Medical"],
  },
  {
    id: "video-downloader",
    name: "Video Downloader",
    description: "Paste a YouTube, Instagram, or Facebook video URL to download as MP4 (360p–1080p) or MP3. Max 100 MB.",
    url: "/video-downloader.html",
    icon: "video",
    tags: ["Utility", "Media"],
  },
];

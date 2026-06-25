export interface App {
  id: string;
  name: string;
  description: string;
  url: string;
  thumbnail?: string;
  tags?: string[];
}

export const apps: App[] = [
  {
    id: "bug-tracker",
    name: "Bug Tracker",
    description: "File, assign, and prioritize bugs in one place to fix issues faster.",
    url: "#",
    tags: ["Productivity", "Dev tools"],
  },
  {
    id: "xray-identifier",
    name: "Medical Image Analyzer",
    description: "Upload an X-Ray, CT Scan, or MRI image and get a detailed AI-powered radiological analysis with findings and recommendations.",
    url: "/xray-analyzer.html",
    tags: ["AI", "Medical"],
  },
  {
    id: "otc-medicine",
    name: "OTC Medicine Guide",
    description: "A visual infographic reference for over-the-counter medications, dosages, and usage guidelines.",
    url: "/otc_medicine_infographic.html",
    tags: ["Health", "Reference"],
  },
  {
    id: "unit-converter",
    name: "Unit Converter",
    description: "Quickly convert between units of length, weight, temperature, volume, and more.",
    url: "/unit_converter.html",
    tags: ["Utility"],
  },
  {
    id: "lab-report",
    name: "Lab Report Analysis",
    description: "Upload a lab report PDF or image and get an AI-generated summary with flagged values and recommendations.",
    url: "/lab-report.html",
    tags: ["AI", "Medical"],
  },
];

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Utility App",
  description: "A collection of tools and apps built to get things done.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}

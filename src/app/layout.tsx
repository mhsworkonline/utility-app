import type { Metadata } from "next";
import Script from "next/script";
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
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Runs before first paint so there's no flash of the wrong theme —
            same 'ua_theme' key and resolution logic as every standalone tool
            page's inline bootstrap (see public/*.html), kept in sync
            afterward by <ThemeToggle>. beforeInteractive is what makes Next
            inline this into the initial HTML and run it pre-hydration
            instead of treating it as an inert client render. */}
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {`(function(){try{var p=localStorage.getItem('ua_theme')||'system';var m=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;document.documentElement.setAttribute('data-theme-mode',m);document.documentElement.setAttribute('data-theme-pref',p);}catch(e){}})();`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}

import Image from "next/image";
import type { App } from "@/data/apps";

const ICONS: Record<string, React.ReactNode> = {
  store: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <rect x="3" y="3" width="5.5" height="5.5" rx="1.5" />
      <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.5" />
      <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.5" />
      <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.5" />
    </svg>
  ),
  scan: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M7 7h2M7 10h6M7 13h4" />
    </svg>
  ),
  pill: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M4.5 10.5a5.5 5.5 0 0 1 5.5-5.5 5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5A5.5 5.5 0 0 1 4.5 10.5z" />
      <path d="M7.5 7.5l5 5" />
    </svg>
  ),
  ruler: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="2" y="7" width="16" height="6" rx="1.5" />
      <path d="M5 7v2M8 7v3M11 7v2M14 7v3" />
    </svg>
  ),
  clipboard: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M7 4H5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2" />
      <rect x="7" y="2.5" width="6" height="3" rx="1" />
      <path d="M7.5 11l2 2 3.5-3.5" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="2" y="5" width="11" height="10" rx="1.5" />
      <path d="M13 8.5l5-2.5v7l-5-2.5" />
    </svg>
  ),
};

const ICON_STYLE: Record<string, { bg: string; color: string }> = {
  store:     { bg: "#EEF2FF", color: "#4F46E5" },
  scan:      { bg: "#EFF6FF", color: "#3B82F6" },
  pill:      { bg: "#F0FDF4", color: "#16A34A" },
  ruler:     { bg: "#F5F3FF", color: "#7C3AED" },
  clipboard: { bg: "#F0F9FF", color: "#0284C7" },
  video:     { bg: "#FFF7ED", color: "#EA580C" },
};

export default function AppCard({ app }: { app: App }) {
  const iconKey = app.icon ?? "";
  const iconStyle = ICON_STYLE[iconKey];
  const iconNode = ICONS[iconKey];

  return (
    <a
      href={app.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col bg-surface-raised border border-surface-border rounded-xl shadow-card hover:bg-surface-hover hover:shadow-dropdown transition-shadow duration-150 overflow-hidden min-h-[11rem]"
    >
      {app.thumbnail && (
        <div className="relative w-full h-36 bg-surface-active flex-shrink-0">
          <Image src={app.thumbnail} alt={app.name} fill className="object-cover" />
        </div>
      )}

      <div className="flex flex-col flex-1 gap-2 p-5">
        {iconNode && iconStyle && (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mb-0.5"
            style={{ backgroundColor: iconStyle.bg, color: iconStyle.color }}
          >
            {iconNode}
          </div>
        )}

        <h2 className="text-lg font-semibold text-ink leading-snug">{app.name}</h2>
        <p className="text-sm text-ink-muted leading-relaxed flex-1">{app.description}</p>

        {app.tags && app.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {app.tags.map((tag) => (
              <span key={tag} className="bg-brand-light text-brand text-xs font-medium rounded-sm px-2 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}

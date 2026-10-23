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
  table: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M3 8h14M3 13h14M8 3v14" />
    </svg>
  ),
  whiteboard: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="2.5" y="4" width="15" height="10" rx="1.5" />
      <path d="M10 14v3M7 17h6" />
      <path d="M6 9l2 2 4-4" />
    </svg>
  ),
  record: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="2" y="5" width="16" height="11" rx="2" />
      <circle cx="10" cy="10.5" r="2.5" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" />
      <path d="M4.5 9.5v.5a5.5 5.5 0 0 0 11 0v-.5M10 15.5v2.5M7.3 18h5.4" />
    </svg>
  ),
  pdf: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M6 2.5h6l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" />
      <path d="M12 2.5v3h3" />
      <path d="M7 11h6M7 14h4" />
    </svg>
  ),
  scissors: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="5" cy="5" r="2" />
      <circle cx="5" cy="15" r="2" />
      <path d="M6.5 6.5L16 16M6.5 13.5L16 4" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M10 2.5c-2 0-3.5 1.6-3.5 3.6v2.3c0 .5-.2 1-.5 1.4l-1.2 1.5c-.5.6-.1 1.6.7 1.6h9c.8 0 1.2-1 .7-1.6l-1.2-1.5c-.3-.4-.5-.9-.5-1.4V6.1c0-2-1.5-3.6-3.5-3.6z" />
      <path d="M8.2 15.5a1.8 1.8 0 0 0 3.6 0" />
    </svg>
  ),
  qr: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="2.5" y="2.5" width="5" height="5" rx="1" />
      <rect x="12.5" y="2.5" width="5" height="5" rx="1" />
      <rect x="2.5" y="12.5" width="5" height="5" rx="1" />
      <rect x="13" y="13" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="16" y="13" width="1.5" height="1.5" fill="currentColor" stroke="none" />
      <rect x="13" y="16" width="1.5" height="1.5" fill="currentColor" stroke="none" />
      <rect x="16" y="16" width="1.5" height="1.5" fill="currentColor" stroke="none" />
    </svg>
  ),
};

const ICON_STYLE: Record<string, { bg: string; color: string }> = {
  store:     { bg: "#EEF2FF", color: "#4F46E5" },
  scan:      { bg: "#EFF6FF", color: "#3B82F6" },
  pill:      { bg: "#F0FDF4", color: "#16A34A" },
  ruler:     { bg: "#F5F3FF", color: "#7C3AED" },
  clipboard: { bg: "#F0F9FF", color: "#0284C7" },
  video:      { bg: "#FFF7ED", color: "#EA580C" },
  table:      { bg: "#ECFDF5", color: "#059669" },
  whiteboard: { bg: "#FEF2F2", color: "#E11D48" },
  record:     { bg: "#FEF2F2", color: "#DC2626" },
  mic:        { bg: "#F5F3FF", color: "#7C3AED" },
  pdf:        { bg: "#FFFBEB", color: "#D97706" },
  qr:         { bg: "#F0FDFA", color: "#0D9488" },
  bell:       { bg: "#FFF1F2", color: "#E11D48" },
  scissors:   { bg: "#ECFEFF", color: "#0891B2" },
};

/**
 * Compact by default (icon + name only, so a whole catalog fits on screen
 * without scrolling); the description and tags live in a panel that's
 * absolutely positioned over the tile and only revealed on hover, so it
 * never affects the grid's layout or pushes neighboring tiles around.
 * Below the `md` breakpoint (effectively: touch devices, which don't really
 * have hover) the panel never renders at all — tapping a tile just opens it.
 */
export default function AppCard({ app, isNew }: { app: App; isNew?: boolean }) {
  const iconKey = app.icon ?? "";
  const iconStyle = ICON_STYLE[iconKey];
  const iconNode = ICONS[iconKey];
  const underMaintenance = app.status === "maintenance";

  const icon = iconNode && iconStyle ? (
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: iconStyle.bg, color: iconStyle.color }}
    >
      {iconNode}
    </div>
  ) : null;

  const face = (
    <div className="flex flex-col items-center justify-center gap-2 text-center h-28 sm:h-32 p-3">
      {icon}
      <h2 className="text-xs sm:text-[13px] font-semibold text-ink leading-snug line-clamp-2">{app.name}</h2>
    </div>
  );

  const detailPanel = (
    <div
      className="hidden md:flex flex-col absolute left-0 top-0 w-full rounded-xl border border-surface-border bg-surface-raised shadow-dropdown p-4
                 opacity-0 invisible scale-95 origin-top pointer-events-none
                 group-hover:opacity-100 group-hover:visible group-hover:scale-100 group-hover:pointer-events-auto
                 transition-[opacity,transform,visibility] duration-150 z-10"
    >
      <div className="flex items-center gap-2.5 mb-2">
        {icon}
        <h2 className="text-sm font-semibold text-ink leading-snug">{app.name}</h2>
      </div>
      <p className="text-xs text-ink-muted leading-relaxed mb-2">{app.description}</p>
      {underMaintenance ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-sm bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          Under maintenance
        </span>
      ) : app.tags && app.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {app.tags.map((tag) => (
            <span key={tag} className="bg-brand-light text-brand text-[11px] font-medium rounded-sm px-2 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (underMaintenance) {
    return (
      <div className="group relative bg-surface-raised border border-surface-border rounded-xl shadow-card opacity-70 cursor-not-allowed">
        {face}
        {detailPanel}
      </div>
    );
  }

  return (
    <a
      href={app.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block bg-surface-raised border border-surface-border rounded-xl shadow-card hover:border-brand-border hover:shadow-dropdown hover:z-20 transition-[box-shadow,border-color] duration-150"
    >
      {isNew && (
        <span className="absolute top-1.5 right-1.5 z-30 bg-success text-white text-[9px] font-bold tracking-wide uppercase rounded-full px-1.5 py-0.5 shadow-card">
          New
        </span>
      )}
      {face}
      {detailPanel}
    </a>
  );
}

import Image from "next/image";
import type { App } from "@/data/apps";

export default function AppCard({ app }: { app: App }) {
  return (
    <a
      href={app.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col bg-surface-raised border border-surface-border rounded-xl shadow-card hover:bg-surface-hover hover:shadow-dropdown transition-shadow duration-150 overflow-hidden min-h-[11rem]"
    >
      {app.thumbnail && (
        <div className="relative w-full h-36 bg-surface-active flex-shrink-0">
          <Image
            src={app.thumbnail}
            alt={app.name}
            fill
            className="object-cover"
          />
        </div>
      )}

      <div className="flex flex-col flex-1 gap-2 p-5">
        <h2 className="text-lg font-semibold text-ink leading-snug">
          {app.name}
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed flex-1">
          {app.description}
        </p>

        {app.tags && app.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {app.tags.map((tag) => (
              <span
                key={tag}
                className="bg-brand-light text-brand text-xs font-medium rounded-sm px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}

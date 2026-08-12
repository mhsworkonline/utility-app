"use client";

import { useMemo, useState } from "react";
import AppCard from "@/components/AppCard";
import type { App } from "@/data/apps";
import { isNewApp } from "@/data/new-apps";

export default function AppGrid({ apps }: { apps: App[] }) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const app of apps) for (const t of app.tags ?? []) set.add(t);
    return Array.from(set).sort();
  }, [apps]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((app) => {
      if (activeTag && !(app.tags ?? []).includes(activeTag)) return false;
      if (!q) return true;
      return app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q);
    });
  }, [apps, query, activeTag]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTag === null
                ? "bg-brand text-white"
                : "bg-brand-light text-brand hover:bg-brand-border/40"
            }`}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTag === tag
                  ? "bg-brand text-white"
                  : "bg-brand-light text-brand hover:bg-brand-border/40"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
          >
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M17 17l-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps…"
            className="w-full rounded-lg border border-surface-border bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-border"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-muted">No apps match your search.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((app, i) => (
            <div
              key={app.id}
              className="animate-[card-in_.3s_ease-out_backwards]"
              style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
            >
              <AppCard app={app} isNew={isNewApp(app.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

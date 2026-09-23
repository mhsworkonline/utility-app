"use client";

import { useEffect, useState } from "react";

type Pref = "light" | "dark" | "system";

const KEY = "ua_theme";

function resolve(pref: Pref): "light" | "dark" {
  if (pref !== "system") return pref;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(pref: Pref) {
  const mode = resolve(pref);
  document.documentElement.setAttribute("data-theme-mode", mode);
  document.documentElement.setAttribute("data-theme-pref", pref);
}

const OPTIONS: { key: Pref; label: string; icon: React.ReactNode }[] = [
  {
    key: "light",
    label: "Light",
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    key: "dark",
    label: "Dark",
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
      </svg>
    ),
  },
  {
    key: "system",
    label: "System",
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
];

/** Light/dark/system toggle. Preference is shared (same localStorage key) with every standalone tool page, so it's consistent across the whole app. */
export default function ThemeToggle() {
  // Starts null so the server-rendered markup never guesses a theme — the
  // inline bootstrap script in layout.tsx already set the real attribute on
  // <html> before this component even mounts; we just read it back once
  // mounted, avoiding a hydration mismatch between server and client.
  const [pref, setPref] = useState<Pref | null>(null);

  useEffect(() => {
    // One-time read of what the pre-hydration bootstrap script already
    // applied to <html> — not derivable from props/state, so it can't move
    // out of an effect the way the lint rule's default advice assumes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPref((document.documentElement.getAttribute("data-theme-pref") as Pref) || "system");
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(KEY) as Pref) === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const choose = (next: Pref) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    apply(next);
    setPref(next);
  };

  return (
    <div className="flex shrink-0 gap-0.5 rounded-full border border-surface-border bg-surface-raised p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => choose(opt.key)}
          title={`${opt.label} mode`}
          aria-label={`${opt.label} mode`}
          className={`flex h-[26px] w-[26px] items-center justify-center rounded-full transition-colors ${
            pref === opt.key ? "bg-brand text-white" : "text-ink-subtle hover:text-ink"
          }`}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}

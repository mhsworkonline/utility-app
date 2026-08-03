"use client";

import { useCallback, useEffect, useState } from "react";
import type { App } from "@/data/apps";

type ProviderId = "groq" | "openai" | "anthropic" | "gemini";
type ModelCfg = { provider: ProviderId; model: string; max_tokens: number; temperature: number; reasoning_effort: string };
type Settings = {
  keys: Record<ProviderId, string>;
  has_key: Record<ProviderId, boolean>;
  analyze: ModelCfg;
  lab_report: ModelCfg;
};

const PROVIDERS: { id: ProviderId; label: string; hint: string }[] = [
  { id: "groq", label: "Groq", hint: "gsk_…" },
  { id: "openai", label: "OpenAI", hint: "sk-…" },
  { id: "anthropic", label: "Anthropic", hint: "sk-ant-…" },
  { id: "gemini", label: "Google Gemini", hint: "AIza…" },
];
type Tile = { name: string; ok: boolean; detail: string };
type ErrRow = { id: number; app: string; message: string; created_at: string };

const TABS = ["AI Settings", "Video Downloader", "Apps", "Health", "Errors"] as const;
type Tab = (typeof TABS)[number];

/* Shared button styles so actions are colour-coded by intent. */
const BTN = {
  primary: "rounded-lg bg-blue-600 px-5 py-2.5 text-base font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50",
  success: "rounded-lg bg-green-600 px-4 py-2 text-base font-medium text-white transition hover:bg-green-700 disabled:opacity-50",
  neutral: "rounded-lg border border-surface-border bg-white px-4 py-2 text-base text-ink transition hover:bg-surface-hover disabled:opacity-40",
  danger: "rounded-lg bg-red-600 px-4 py-2 text-base font-medium text-white transition hover:bg-red-700",
  dangerGhost: "rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50",
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("AI Settings");
  const [toast, setToast] = useState("");
  const [storage, setStorage] = useState<{ ok: boolean; reason: string } | null>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 3500);
  }, []);

  useEffect(() => {
    fetch("/api/admin/status").then((r) => r.json()).then(setStorage).catch(() => setStorage({ ok: false, reason: "Status check failed." }));
  }, []);

  return (
    <main className="min-h-screen bg-surface text-base">
      <header className="border-b border-surface-border bg-surface-raised">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Admin</h1>
            <p className="text-base text-ink-muted">Manage models, apps and integrations.</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" className={BTN.neutral}>View site</a>
            <button
              onClick={async () => {
                await fetch("/api/admin/logout", { method: "POST" });
                window.location.href = "/admin/login";
              }}
              className={BTN.dangerGhost + " px-4 py-2 text-base"}
            >
              Sign out
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 sm:px-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-base transition ${
                tab === t ? "border-blue-600 font-semibold text-blue-700" : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {storage && !storage.ok && (
        <div className="mx-auto mt-4 max-w-5xl px-4 sm:px-6">
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-base text-red-800">
            <strong>Settings cannot be saved.</strong> {storage.reason}
            <div className="mt-1 text-sm">
              Add a real <code className="rounded bg-red-100 px-1">SUPABASE_SERVICE_ROLE_KEY</code> to{" "}
              <code className="rounded bg-red-100 px-1">.env.local</code> (Supabase → Project Settings → API), then restart the dev server.
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="mx-auto mt-4 max-w-5xl px-4 sm:px-6">
          <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-base text-green-800">{toast}</div>
        </div>
      )}

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {tab === "AI Settings" && <AiTab flash={flash} />}
        {tab === "Video Downloader" && <VideoDownloaderTab flash={flash} />}
        {tab === "Apps" && <AppsTab flash={flash} />}
        {tab === "Health" && <HealthTab />}
        {tab === "Errors" && <ErrorsTab flash={flash} />}
      </div>
    </main>
  );
}

/* ---------------- AI Settings ---------------- */

function AiTab({ flash }: { flash: (m: string) => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [newKeys, setNewKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [models, setModels] = useState<Partial<Record<ProviderId, string[]>>>({});
  const [loadingModels, setLoadingModels] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [probe, setProbe] = useState<Record<string, string>>({});

  const reload = useCallback(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then(setS).catch((e) => setErr(String(e)));
  }, []);
  useEffect(reload, [reload]);

  const loadModels = useCallback(async (provider: ProviderId) => {
    setLoadingModels((m) => ({ ...m, [provider]: true }));
    const r = await fetch(`/api/admin/models?provider=${provider}`);
    const d = await r.json();
    setLoadingModels((m) => ({ ...m, [provider]: false }));
    if (!r.ok) {
      setModels((m) => ({ ...m, [provider]: [] }));
      setErr(`${provider}: ${d.error ?? "could not load models"}`);
      return;
    }
    setErr("");
    setModels((m) => ({ ...m, [provider]: d.models ?? [] }));
  }, []);

  // Fetch models for whichever providers are actually in use and have a key.
  useEffect(() => {
    if (!s) return;
    const inUse = new Set<ProviderId>([s.analyze.provider, s.lab_report.provider]);
    inUse.forEach((p) => {
      if (s.has_key[p] && !models[p] && !loadingModels[p]) loadModels(p);
    });
  }, [s, models, loadingModels, loadModels]);

  async function save() {
    if (!s) return;
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...s, keys: newKeys }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(d.error ?? "Save failed.");
    setNewKeys({});
    setModels({});
    flash("Settings saved. Live within 60 seconds.");
    reload();
  }

  async function test(which: "analyze" | "lab_report") {
    if (!s) return;
    setProbe((p) => ({ ...p, [which]: "Testing…" }));
    const res = await fetch("/api/admin/test-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: s[which].provider, model: s[which].model }),
    });
    const d = await res.json();
    setProbe((p) => ({
      ...p,
      [which]: d.ok
        ? `✓ Works (${d.latency_ms}ms) · vision ${d.vision ? "supported" : "NOT supported"}`
        : `✗ ${d.error ?? "Failed"}`,
    }));
  }

  if (!s) return <p className="text-base text-ink-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      {err && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-base text-red-700">{err}</p>}

      <Card title="Provider API keys" desc="Stored in Supabase. Rotating a key here takes effect without a redeploy. Leave blank to keep the saved key.">
        <div className="space-y-2">
          {PROVIDERS.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="w-32 shrink-0 text-base text-ink">{p.label}</span>
              <input
                value={newKeys[p.id] ?? ""}
                onChange={(e) => setNewKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                placeholder={s.has_key[p.id] ? `Saved: ${s.keys[p.id]}` : `Not set — ${p.hint}`}
                className="flex-1 rounded-lg border border-surface-border bg-white px-3 py-2 font-mono text-base outline-none focus:border-brand"
              />
              <span className={`w-16 shrink-0 text-sm ${s.has_key[p.id] ? "text-green-700" : "text-ink-muted"}`}>
                {s.has_key[p.id] ? "● saved" : "○ empty"}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {(["analyze", "lab_report"] as const).map((k) => {
        const prov = s[k].provider;
        const list = models[prov] ?? [];
        return (
          <Card
            key={k}
            title={k === "analyze" ? "Medical Image Analyzer" : "Lab Report Analysis"}
            desc="Models are fetched live from the selected provider — only models that key can use are listed. Both apps send images, so pick a vision-capable model."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Provider">
                <select
                  value={prov}
                  onChange={(e) => setS({ ...s, [k]: { ...s[k], provider: e.target.value as ProviderId, model: "" } })}
                  className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-base outline-none focus:border-brand"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={`Model${loadingModels[prov] ? " (loading…)" : list.length ? ` (${list.length})` : ""}`}>
                <div className="flex gap-2">
                  <select
                    value={list.includes(s[k].model) ? s[k].model : "__custom__"}
                    onChange={(e) => {
                      if (e.target.value !== "__custom__") setS({ ...s, [k]: { ...s[k], model: e.target.value } });
                    }}
                    disabled={!s.has_key[prov]}
                    className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-base outline-none focus:border-brand disabled:bg-surface-hover"
                  >
                    {!s.has_key[prov] && <option>Save a {prov} key first</option>}
                    {list.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    <option value="__custom__">— custom below —</option>
                  </select>
                  <button
                    onClick={() => loadModels(prov)}
                    disabled={!s.has_key[prov]}
                    title="Refresh model list"
                    className="shrink-0 rounded-lg border border-surface-border px-3 text-base hover:bg-surface-hover disabled:opacity-40"
                  >
                    ↻
                  </button>
                </div>
                <input
                  value={s[k].model}
                  onChange={(e) => setS({ ...s, [k]: { ...s[k], model: e.target.value } })}
                  placeholder="model id"
                  className="mt-2 w-full rounded-lg border border-surface-border bg-white px-3 py-2 font-mono text-sm outline-none focus:border-brand"
                />
              </Field>

            </div>

            <div className="mt-3 flex items-center gap-3">
              <button onClick={() => test(k)} className={BTN.success}>
                Test model
              </button>
              {probe[k] && (
                <span className={`text-base ${probe[k].startsWith("✓") ? "text-green-700" : probe[k] === "Testing…" ? "text-ink-muted" : "text-red-600"}`}>
                  {probe[k]}
                </span>
              )}
            </div>
          </Card>
        );
      })}

      <button
        onClick={save}
        disabled={busy}
        className={BTN.primary}
      >
        {busy ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}

/* ---------------- Video Downloader ---------------- */

type VideoCookieStatus = { has_cookies: boolean; cookie_count: number };

function VideoDownloaderTab({ flash }: { flash: (m: string) => void }) {
  const [status, setStatus] = useState<VideoCookieStatus | null>(null);
  const [cookies, setCookies] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reload = useCallback(() => {
    fetch("/api/admin/video-settings").then((r) => r.json()).then(setStatus).catch((e) => setErr(String(e)));
  }, []);
  useEffect(reload, [reload]);

  async function save() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/video-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookies }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(d.error ?? "Save failed.");
    setCookies("");
    flash("Cookies saved. Takes effect on the next download (within 60 seconds).");
    reload();
  }

  async function clear() {
    if (!confirm("Remove the saved cookies?")) return;
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/video-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookies: "" }),
    });
    setBusy(false);
    if (!res.ok) return setErr("Clear failed.");
    flash("Cookies cleared.");
    reload();
  }

  return (
    <div className="space-y-6">
      {err && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-base text-red-700">{err}</p>}

      <Card
        title="Login cookies"
        desc="Some YouTube requests and most Facebook/Instagram videos need a logged-in session. Export cookies.txt from a browser extension (e.g. 'Get cookies.txt') while signed in, then paste the full contents below. Stored in Supabase — works both locally and on the deployed site, no bin/cookies.txt or redeploy needed."
      >
        <div className="mb-3 text-sm">
          {status === null ? (
            "Loading…"
          ) : status.has_cookies ? (
            <span className="text-green-700">● {status.cookie_count} cookie{status.cookie_count === 1 ? "" : "s"} saved</span>
          ) : (
            <span className="text-ink-muted">○ No cookies saved</span>
          )}
        </div>

        <Field label="cookies.txt contents">
          <textarea
            value={cookies}
            onChange={(e) => setCookies(e.target.value)}
            placeholder={status?.has_cookies ? "Paste new content to replace the saved cookies…" : "# Netscape HTTP Cookie File\n…"}
            rows={8}
            spellCheck={false}
            className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 font-mono text-xs outline-none focus:border-brand"
          />
        </Field>

        <div className="mt-3 flex items-center gap-3">
          <button onClick={save} disabled={busy || !cookies.trim()} className={BTN.primary}>
            {busy ? "Saving…" : "Save cookies"}
          </button>
          {status?.has_cookies && (
            <button onClick={clear} disabled={busy} className={BTN.dangerGhost}>
              Clear saved cookies
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Apps ---------------- */

function AppsTab({ flash }: { flash: (m: string) => void }) {
  const [apps, setApps] = useState<App[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/apps").then((r) => r.json()).then((d) => {
      setApps(d.apps ?? []);
      setDirty(false);
    });
  }, []);
  useEffect(load, [load]);

  /** Writes the given order/state straight to the server. */
  const persist = useCallback(
    async (list: App[], message: string) => {
      setBusy(true);
      setErr("");
      const res = await fetch("/api/admin/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apps: list.map((a, i) => ({ ...a, sort_order: i + 1 })) }),
      });
      const d = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) {
        setErr(d.error ?? "Save failed.");
        return false;
      }
      setDirty(false);
      flash(message);
      return true;
    },
    [flash],
  );

  // Text edits stay local until "Save changes" — they're mid-typing.
  function update(i: number, patch: Partial<App>) {
    setApps((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setDirty(true);
  }

  // Show/hide and reorder are single deliberate clicks, so save them immediately.
  function toggleVisible(i: number) {
    const next = apps.map((x, j) =>
      j === i ? { ...x, status: (x.status === "hidden" ? "visible" : "hidden") as App["status"] } : x,
    );
    setApps(next);
    persist(next, next[i].status === "hidden" ? `"${next[i].name}" hidden from the homepage.` : `"${next[i].name}" is now visible.`);
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= apps.length) return;
    const next = [...apps];
    [next[i], next[j]] = [next[j], next[i]];
    setApps(next);
    persist(next, "Order updated.");
  }

  async function save() {
    if (await persist(apps, "Apps saved. The homepage updates immediately.")) load();
  }

  async function remove(id: string) {
    if (!confirm(`Delete "${id}"? This removes it from the homepage.`)) return;
    await fetch(`/api/admin/apps?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      {err && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-base text-red-700">{err}</p>}
      <p className="text-sm text-ink-muted">
        Show/hide and reordering save automatically. Text edits need <strong>Save changes</strong>.
      </p>

      {apps.map((a, i) => (
        <div key={a.id} className="rounded-xl border border-surface-border bg-surface-raised p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={a.name}
              onChange={(e) => update(i, { name: e.target.value })}
              className="flex-1 min-w-[12rem] rounded-lg border border-surface-border bg-white px-3 py-1.5 text-base font-medium outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={() => toggleVisible(i)}
              title={a.status === "hidden" ? "Hidden from the homepage" : "Shown on the homepage"}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-surface-border px-2.5 py-1.5 text-base hover:bg-surface-hover"
            >
              <span
                className={`relative h-4 w-8 rounded-full transition ${
                  a.status === "hidden" ? "bg-gray-300" : "bg-green-500"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
                    a.status === "hidden" ? "left-0.5" : "left-[18px]"
                  }`}
                />
              </span>
              <span className={a.status === "hidden" ? "text-ink-muted" : "text-ink"}>
                {a.status === "hidden" ? "Hidden" : "Shown"}
              </span>
            </button>
            <button onClick={() => move(i, -1)} className="rounded-lg border border-surface-border bg-white px-3 py-1.5 text-base text-ink hover:bg-surface-hover">↑</button>
            <button onClick={() => move(i, 1)} className="rounded-lg border border-surface-border bg-white px-3 py-1.5 text-base text-ink hover:bg-surface-hover">↓</button>
            <button onClick={() => remove(a.id)} className={BTN.dangerGhost}>Delete</button>
          </div>
          <textarea
            value={a.description}
            onChange={(e) => update(i, { description: e.target.value })}
            rows={2}
            className="mt-2 w-full rounded-lg border border-surface-border bg-white px-3 py-1.5 text-base outline-none focus:border-brand"
          />
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <input value={a.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="/app.html"
              className="rounded-lg border border-surface-border bg-white px-3 py-2 font-mono text-base outline-none focus:border-brand" />
            <input value={a.icon ?? ""} onChange={(e) => update(i, { icon: e.target.value })} placeholder="icon key"
              className="rounded-lg border border-surface-border bg-white px-3 py-2 font-mono text-base outline-none focus:border-brand" />
            <input value={(a.tags ?? []).join(", ")} onChange={(e) => update(i, { tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
              placeholder="tags, comma separated"
              className="rounded-lg border border-surface-border bg-white px-3 py-1.5 text-sm outline-none focus:border-brand" />
          </div>
        </div>
      ))}

      <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-surface-border bg-surface-raised/95 p-3 shadow-card backdrop-blur">
        <button
          onClick={() => {
            setApps([...apps, { id: `app-${Date.now()}`, name: "New app", description: "", url: "/", icon: "", tags: [], status: "hidden" }]);
            setDirty(true);
          }}
          className={BTN.neutral}
        >
          + Add app
        </button>
        <button onClick={save} disabled={busy || !dirty} className={BTN.primary}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        {dirty && <span className="text-base font-medium text-amber-700">Unsaved changes</span>}
        {!dirty && !busy && <span className="text-base text-green-700">All changes saved</span>}
      </div>
      <p className="text-sm text-ink-muted">
        Icon keys available: scan, pill, ruler, clipboard, store, video, table, whiteboard.
      </p>
    </div>
  );
}

/* ---------------- Health ---------------- */

function HealthTab() {
  const [tiles, setTiles] = useState<Tile[] | null>(null);

  const run = useCallback(() => {
    setTiles(null);
    fetch("/api/admin/health").then((r) => r.json()).then((d) => setTiles(d.tiles ?? []));
  }, []);
  useEffect(run, [run]);

  return (
    <div className="space-y-4">
      <button onClick={run} className={BTN.neutral}>
        Re-run checks
      </button>
      {!tiles ? (
        <p className="text-base text-ink-muted">Running checks…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tiles.map((t) => (
            <div key={t.name} className={`rounded-xl border p-4 ${t.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${t.ok ? "bg-green-500" : "bg-red-500"}`} />
                <span className="text-base font-medium text-ink">{t.name}</span>
              </div>
              <p className={`mt-1 text-sm ${t.ok ? "text-green-800" : "text-red-700"}`}>{t.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Errors ---------------- */

function ErrorsTab({ flash }: { flash: (m: string) => void }) {
  const [rows, setRows] = useState<ErrRow[] | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/errors").then((r) => r.json()).then((d) => setRows(d.errors ?? []));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={load} className={BTN.neutral}>Refresh</button>
        <button
          onClick={async () => {
            await fetch("/api/admin/errors", { method: "DELETE" });
            flash("Error log cleared.");
            load();
          }}
          className={BTN.danger}
        >
          Clear log
        </button>
      </div>
      {!rows ? (
        <p className="text-base text-ink-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-base text-ink-muted">No errors logged. </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-base">
            <thead className="bg-surface-raised text-left text-sm uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">App</th>
                <th className="px-3 py-2">Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-surface-border align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-sm text-ink-muted">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm font-medium">{r.app}</td>
                  <td className="px-3 py-2 text-sm text-red-700">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- shared ---------------- */

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-surface-border bg-surface-raised p-5">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {desc && <p className="mt-0.5 mb-3 text-sm text-ink-muted">{desc}</p>}
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

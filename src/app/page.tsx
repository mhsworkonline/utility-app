import AppGrid from "@/components/AppGrid";
import { getApps } from "@/data/apps";

// Catalog is managed from /admin, so render at request time.
export const dynamic = "force-dynamic";

export default async function Home() {
  const apps = await getApps();
  return (
    <main className="flex-1 bg-surface">
      {/* Hero */}
      <div className="border-b border-surface-border bg-surface px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-semibold text-ink">Utility App</h1>
          <p className="mt-1 text-base text-ink-muted">
            A collection of tools built to get things done.
          </p>
        </div>
      </div>

      {/* App grid */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {apps.length === 0 ? (
          <p className="text-sm text-ink-muted">No apps yet.</p>
        ) : (
          <AppGrid apps={apps} />
        )}
      </div>
    </main>
  );
}

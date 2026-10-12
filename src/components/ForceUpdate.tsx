// A forced update. When the manifest names a minimum version newer than this one, the window
// is given over to the update: what changed since this version, and one button. There is no
// way past it but installing — the point of forcing a release is that the version before it
// is not safe to keep using. It is checked at launch, before signing in, and every hour.
import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { fetch as httpFetch } from "@tauri-apps/plugin-http";
import { Logo } from "./Logo";
import { Spinner } from "./icons";
import { Notes } from "./UpdateNotes";
import { forced, notesSince, type Manifest } from "@/lib/updates";
import { failureReason } from "@/lib/progress";

const MANIFEST = "https://updates.emreb.dev/updates/latest.json";

/**
 * The manifest, if it says this version must update. A manifest that cannot be read forces
 * nothing: the update service being down is no reason to lock anyone out.
 */
async function mustUpdate(): Promise<{ manifest: Manifest; running: string } | null> {
  try {
    const [res, running] = await Promise.all([httpFetch(`${MANIFEST}?x=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } }), getVersion()]);
    if (!res.ok) return null;
    const manifest = (await res.json()) as Manifest;
    return forced(manifest, running, new Date()) ? { manifest, running } : null;
  } catch {
    return null;
  }
}

export function ForceUpdate({ children }: { children: ReactNode }) {
  const [due, setDue] = useState<{ manifest: Manifest; running: string } | null>(null);

  useEffect(() => {
    const look = () => void mustUpdate().then((found) => found && setDue(found));
    look();
    const hourly = setInterval(look, 60 * 60 * 1000);
    return () => clearInterval(hourly);
  }, []);

  if (!due) return <>{children}</>;
  return <Required manifest={due.manifest} running={due.running} />;
}

function Required({ manifest, running }: { manifest: Manifest; running: string }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const changes = notesSince(manifest, running);

  const install = async () => {
    setError(undefined);
    setProgress(0);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const found = await check();
      if (!found) throw new Error("The update is not being offered right now. Try again in a minute.");
      let taken = 0;
      let total = 0;
      await found.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          taken += event.data.chunkLength;
          if (total) setProgress(taken / total);
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setProgress(null);
      setError(failureReason(e));
    }
  };

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg-window)", color: "var(--text)" }}>
      <div data-tauri-drag-region className="h-[38px] shrink-0" />
      <div className="flex min-h-0 flex-1 flex-col items-center px-6 pb-8">
        <div className="flex w-[640px] max-w-full min-h-0 flex-1 flex-col gap-5">
          <div className="flex items-center gap-4">
            <Logo size={48} />
            <div>
              <h1 className="text-[20px] font-semibold">Flux {manifest.version} is required</h1>
              <p className="text-[13px]" style={{ color: "var(--text-dim)" }}>
                You are on {running}, which can no longer be used. Update to keep working — it takes a moment, and Flux opens again where you left it.
              </p>
            </div>
          </div>

          <div
            className="selectable min-h-0 flex-1 overflow-auto rounded-[10px] px-6 py-4 text-[12.5px] leading-relaxed"
            style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
          >
            {changes.length ? (
              changes.map((c) => (
                <section key={c.version} className="pb-4">
                  <h2 className="flex items-center gap-2 pb-1 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                    {c.version}
                    {c.forced && (
                      <span
                        className="rounded-full px-2 py-[1px] text-[10.5px] font-medium"
                        style={{ background: "color-mix(in srgb, var(--red) 18%, transparent)", color: "var(--red)" }}
                      >
                        required
                      </span>
                    )}
                  </h2>
                  <Notes source={c.notes} />
                </section>
              ))
            ) : (
              <p>This release came without notes.</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {progress != null && (
              <div className="h-[6px] flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%`, background: "var(--accent)" }}
                />
              </div>
            )}
            {error && (
              <p className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--red)" }} title={error}>
                {error}
              </p>
            )}
            {progress == null && !error && <span className="flex-1" />}
            <button
              onClick={() => void install()}
              disabled={progress != null}
              className="flex h-[36px] shrink-0 items-center gap-2 rounded-[7px] px-5 text-[13px] font-medium disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
            >
              {progress != null && <Spinner />}
              {progress != null ? `Updating… ${Math.round(progress * 100)}%` : error ? "Try again" : "Update and Restart"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

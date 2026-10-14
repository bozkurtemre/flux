// The update that comes before everything else. At launch, before signing in, the manifest is
// asked whether a newer version is on offer; when one is, the window is given over to it: what
// changed since this version, and one button. The same screen is a forced update's — a version
// the manifest says may no longer be used — which is also looked for every hour, as is a plain
// update while the sign-in screen is still up, where nobody is interrupted.
import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { fetch as httpFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { Logo } from "./Logo";
import { Spinner } from "./icons";
import { Notes } from "./UpdateNotes";
import { available, forced, notesSince, type Manifest } from "@/lib/updates";
import { failureReason } from "@/lib/progress";
import { signedInAs } from "@/lib/cloud";

const MANIFEST = "https://updates.emreb.dev/updates/latest.json";
/** How long the launch waits on the manifest before opening anyway: a slow network is not a lock. */
const LAUNCH_WAIT_MS = 8_000;
/** The splash stays at least this long, so a quick answer does not make it a flicker. */
const SPLASH_MIN_MS = 1_100;

type Due = { manifest: Manifest; running: string; forced: boolean };

/**
 * The manifest, if it has an update to stop for: one this version must take, or, when nothing
 * is being used yet (`idle`), any newer one. A manifest that cannot be read stops nothing: the
 * update service being down is no reason to lock anyone out. A dev build is only ever forced,
 * since it is usually behind the manifest on purpose.
 */
async function mustUpdate(idle: boolean): Promise<Due | null> {
  try {
    const [res, running] = await Promise.all([
      httpFetch(`${MANIFEST}?x=${Date.now()}`, { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(LAUNCH_WAIT_MS) }),
      getVersion(),
    ]);
    if (!res.ok) return null;
    const manifest = (await res.json()) as Manifest;
    const now = new Date();
    if (forced(manifest, running, now)) return { manifest, running, forced: true };
    if (idle && !import.meta.env.DEV && available(manifest, running, now)) return { manifest, running, forced: false };
    return null;
  } catch {
    return null;
  }
}

export function ForceUpdate({ children }: { children: ReactNode }) {
  const [due, setDue] = useState<Due | null>(null);
  // nothing is drawn until the first look has answered, so an update comes before the sign-in
  const [looked, setLooked] = useState(false);

  useEffect(() => {
    // at launch nothing is in use; later, only the sign-in screen is idle
    const look = async (launch: boolean) => {
      const idle = launch || !(await signedInAs().catch(() => null));
      const found = await mustUpdate(idle);
      if (found) setDue(found);
      setLooked(true);
      return found;
    };
    // the splash is up until this window knows what to draw; the main window starts hidden
    const started = Date.now();
    const say = (status: string) => emitTo("splash", "splash-status", status).catch(() => {});
    void say("Checking for updates…");
    void look(true).then(async (found) => {
      void say(found ? `Flux ${found.manifest.version} is waiting` : "Opening…");
      await new Promise((r) => setTimeout(r, Math.max(0, SPLASH_MIN_MS - (Date.now() - started))));
      await invoke("splash_done").catch(() => {});
    });
    const hourly = setInterval(() => void look(false), 60 * 60 * 1000);
    return () => clearInterval(hourly);
  }, []);

  if (due) return <Required manifest={due.manifest} running={due.running} forced={due.forced} />;
  if (!looked) return <div className="h-full" style={{ background: "var(--bg-window)" }} />;
  return <>{children}</>;
}

function Required({ manifest, running, forced }: { manifest: Manifest; running: string; forced: boolean }) {
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
              <h1 className="text-[20px] font-semibold">{forced ? `Flux ${manifest.version} is required` : `Flux ${manifest.version} is ready`}</h1>
              <p className="text-[13px]" style={{ color: "var(--text-dim)" }}>
                {forced
                  ? `You are on ${running}, which can no longer be used. Update to keep working — it takes a moment, and Flux opens again where you left it.`
                  : `You are on ${running}. Update to continue — it takes a moment, and Flux opens again where you left it.`}
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

// The door. Flux opens only for someone signed in, and that is asked of Supabase every launch.
// A session already on this machine opens the IDE at once and is checked behind it; one Supabase
// refuses ends in a dialog over the IDE that leaves two ways out: sign in again, or quit.
// Signing in is an email with a link; the link comes back to this app through its own URL
// scheme, and the preferences kept in the cloud are put in place before the window opens.
//
// It takes the whole window: on the left what Flux is, on the right the one thing to do.
import { useEffect, useState, type ReactNode } from "react";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { ArrowRight, Bug, ChevronDown, Fingerprint, Link2, Lock, Mail, Microscope, RotateCw, Sparkles, Waypoints, WifiOff, X } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ConfirmDialog } from "./ContextMenu";
import { openUrl } from "@tauri-apps/plugin-opener";
import { REPO, reportUrl } from "@/lib/help";
import { changelogSection } from "@/lib/updates";
import changelog from "../../CHANGELOG.md?raw";
import { Notes } from "./UpdateNotes";
import { Logo } from "./Logo";
import { UI } from "./darkUi";
import { Onboarding } from "./Onboarding";
import { Spinner } from "./icons";
import { AUTH_CALLBACK, finishSignIn, isEmail, pullPreferences, sendLink, signedInAs, verify, type AuthState } from "@/lib/cloud";
import { markToured, toured } from "@/lib/settings";
import { failureReason } from "@/lib/progress";

/** The teal of the logo: the panel that says what Flux is wears its colour, not the chosen accent. */
const BRAND = "#22C8B2";

/** Frosted glass: what the streams pass behind is blurred and darkened, so text on it reads. */
const GLASS = {
  background: "rgba(12, 13, 17, 0.55)",
  backdropFilter: "blur(18px) saturate(140%)",
  WebkitBackdropFilter: "blur(18px) saturate(140%)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
} as const;

/** How long before another link can be asked for, as Supabase is set to allow. */
const RESEND = 60;

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "checking" });
  const [ready, setReady] = useState(false);
  const [welcome, setWelcome] = useState(false);
  // the tour follows the welcome, once per Mac; make dev shows it every time, to work on it
  const [touring, setTouring] = useState(false);
  const afterWelcome = () =>
    void (import.meta.env.DEV ? Promise.resolve(false) : toured()).then((seen) => (seen ? setReady(true) : setTouring(true)));
  const [booted, setBooted] = useState(false);
  const [expired, setExpired] = useState<string | null>(null);

  // signed in is not open yet: the cloud's preferences are written first, so the window comes
  // up with them rather than switching under the person a moment later. Signing in just now is
  // worth a moment of its own; a session that was already good goes straight in.
  const enter = async (next: AuthState, celebrate = false) => {
    setState(next);
    if (next.status !== "signed-in") return;
    try {
      await pullPreferences();
      if (celebrate) setWelcome(true);
      else setReady(true);
    } catch (e) {
      setState({ status: "unreachable", error: failureReason(e) });
    }
  };

  // make dev only: Vite folds import.meta.env.DEV to false in a release build, so prod never has it
  const skip = import.meta.env.DEV
    ? () => {
        setState({ status: "signed-in", email: "dev@localhost" });
        setReady(true);
      }
    : undefined;

  const check = () => {
    setState({ status: "checking" });
    void verify().then(enter);
  };

  useEffect(() => {
    // a session in storage opens the IDE now; Supabase is asked behind it. Only a refusal
    // interrupts: an unreachable Supabase leaves the session as it is, as an offline launch should.
    void signedInAs()
      .catch(() => null)
      .then(async (email) => {
        if (!email) {
          setBooted(true);
          return enter(await verify());
        }
        setState({ status: "signed-in", email });
        setReady(true);
        setBooted(true);
        const now = await verify();
        if (now.status === "signed-out") setExpired(now.error ?? "Your session has ended. Sign in again.");
        // ponytail: preferences pulled now are written to disk and apply from the next launch
        else if (now.status === "signed-in") void pullPreferences().catch(() => {});
      });
    // the link from the email, whether it started Flux or arrived while it was open
    const opened = (urls: string[] | null) => {
      const url = urls?.find((u) => u.startsWith(AUTH_CALLBACK));
      if (url) void finishSignIn(url).then((s) => s && enter(s, true));
    };
    void getCurrent()
      .then(opened)
      .catch(() => {});
    const stop = onOpenUrl(opened);
    return () => void stop.then((unlisten) => unlisten()).catch(() => {});
  }, []);

  if (!booted) return <div className="h-full" style={{ background: "var(--bg-window)" }} />;
  if (touring) {
    return (
      <Onboarding
        onDone={() => {
          void markToured();
          setTouring(false);
          setReady(true);
        }}
      />
    );
  }
  if (ready && state.status === "signed-in") {
    return (
      <>
        {children}
        {expired && (
          <ConfirmDialog
            title="Your session has ended"
            message={`${expired} Flux needs a signed-in account to stay open.`}
            confirmLabel="Sign in again"
            cancelLabel="Quit Flux"
            danger={false}
            onConfirm={() => {
              setReady(false);
              setState({ status: "signed-out", error: expired });
              setExpired(null);
            }}
            onCancel={() => void getCurrentWindow().close()}
            onDismiss={() => {}}
          />
        )}
      </>
    );
  }
  return (
    <div className="relative flex h-full" style={{ background: "var(--bg-window)", color: "var(--text)" }}>
      {/* the title bar is drawn by the app; this strip, across both halves, is where the window is dragged by */}
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 z-10 h-[38px]" />
      <Showcase />
      <div className="relative flex min-w-0 flex-1 items-center justify-center px-8 py-12">
        <div className="flex w-[360px] max-w-full flex-col">
          <Door
            state={state}
            onRetry={check}
            onSignedOut={(error) => setState({ status: "signed-out", error })}
            onLink={(url) => void finishSignIn(url).then((s) => s && enter(s, true))}
            welcome={welcome}
            onIn={afterWelcome}
            onSkip={skip}
          />
        </div>
        <Corner />
      </div>
    </div>
  );
}

/** What Flux is, in the space a sign-in screen usually leaves empty. */
function Showcase() {
  return (
    <div
      className="relative hidden w-[52%] max-w-[760px] shrink-0 flex-col justify-between overflow-hidden px-12 pt-16 pb-12 md:flex"
      style={{ background: "linear-gradient(160deg, #15171c 0%, #0d0e11 60%, #0b0c0f 100%)", color: "#e8e9ec" }}
    >
      <Streams />

      <div className="relative flex items-center gap-3">
        <Logo size={34} />
        <span className="text-[19px] font-semibold tracking-tight">Flux</span>
      </div>

      <div className="relative flex flex-col gap-7">
        <Pitch />

        <AppSlice />
      </div>

      <div className="relative flex flex-wrap gap-2">
        {[
          { icon: <Microscope size={13} />, label: "Investigate to the fix" },
          { icon: <Waypoints size={13} />, label: "Service map from logs" },
          { icon: <Fingerprint size={13} />, label: "Trace any ID" },
        ].map((f) => (
          <span key={f.label} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]" style={{ ...GLASS, color: "#d3d6dc" }}>
            <span style={{ color: BRAND }}>{f.icon}</span>
            {f.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A line through points as one smooth curve: each joint turned into a cubic Bézier whose handles
 * follow its neighbours (Catmull–Rom), so a wave has no corners however few points it is given.
 */
function smooth(pts: [number, number][]): string {
  const out = [`M${pts[0][0]},${pts[0][1].toFixed(1)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    out.push(`C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1].toFixed(1)}`);
  }
  return out.join(" ");
}

/**
 * The panel's background: an aurora of the logo's colours behind streams of light that drift
 * across it, the way lines of logs flow — the flux in the name. Slow enough to be felt rather
 * than watched, and still for anyone who has asked macOS to reduce motion.
 */
function Streams() {
  // each stream a gentle wave across the panel, a little apart from the one before
  const wave = (y: number, amp: number, phase: number) => {
    const pts: [number, number][] = [];
    for (let x = -200; x <= 1400; x += 40) pts.push([x, y + Math.sin(x / 210 + phase) * amp + Math.sin(x / 97 + phase * 1.7) * amp * 0.22]);
    return smooth(pts);
  };
  const streams = Array.from({ length: 14 }, (_, i) => ({
    d: wave(240 + i * 27, 48 + (i % 4) * 10, i * 0.42),
    width: i % 5 === 2 ? 1.6 : 0.85,
    opacity: 0.12 + (i % 5 === 2 ? 0.32 : (i % 3) * 0.06),
    duration: 11 + (i % 6) * 2.5,
    // every third stream carries a light along it, the way a line of log travels down a stream
    pulse: i % 3 === 1,
  }));
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* the aurora: three soft lights that never quite settle */}
      <div
        className="flux-aurora absolute -top-1/4 -left-1/4 size-[85%] rounded-full blur-[90px]"
        style={{ background: `radial-gradient(circle, ${BRAND}66, transparent 62%)` }}
      />
      <div
        className="flux-aurora absolute top-1/3 -right-1/4 size-[70%] rounded-full blur-[100px]"
        style={{ background: "radial-gradient(circle, #3b6cf066, transparent 62%)", animationDelay: "-9s" }}
      />
      <div
        className="flux-aurora absolute -bottom-1/3 left-1/5 size-[65%] rounded-full blur-[110px]"
        style={{ background: "radial-gradient(circle, #7b4fd655, transparent 62%)", animationDelay: "-17s" }}
      />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="flux-stream" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={BRAND} stopOpacity="0" />
            <stop offset="0.35" stopColor={BRAND} stopOpacity="1" />
            <stop offset="0.7" stopColor="#8CF7E2" stopOpacity="0.9" />
            <stop offset="1" stopColor="#3b6cf0" stopOpacity="0" />
          </linearGradient>
        </defs>
        {streams.map((s, i) => (
          <g key={i} className="flux-stream" style={{ animationDuration: `${s.duration}s`, animationDelay: `${-i * 1.7}s` }}>
            <path d={s.d} fill="none" stroke="url(#flux-stream)" strokeWidth={s.width} strokeOpacity={s.opacity} strokeLinecap="round" />
            {s.pulse && (
              <path
                d={s.d}
                fill="none"
                stroke="#8CF7E2"
                strokeWidth={s.width + 0.9}
                strokeLinecap="round"
                strokeOpacity={0.55}
                pathLength={1000}
                strokeDasharray="70 930"
                className="flux-flow"
                style={{ animationDuration: `${7 + (i % 4) * 1.6}s`, animationDelay: `${-i * 0.9}s`, filter: "drop-shadow(0 0 4px #22C8B2)" }}
              />
            )}
          </g>
        ))}
      </svg>
      {/* the bottom and the edge fade to the panel's own dark, so the text sits on calm */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(11,12,15,0.55) 0%, transparent 30%, transparent 60%, rgba(11,12,15,0.85) 100%)" }}
      />
    </div>
  );
}

/**
 * A slice of Flux itself, a second after a spike: a console with its query, the timeline with
 * the 95th percentile and the failures drawn over it and a merge marked where it landed, and the
 * rows under it. Drawn in the app's own colours rather than pasted in as a picture, so it is
 * sharp on every screen and never shows an older Flux than the one being signed in to. It runs
 * off the right and the bottom, the way a crop of a screenshot does.
 */
function AppSlice() {
  // requests per bucket, and what the timeline draws over them
  const counts = [22, 24, 21, 26, 25, 28, 27, 30, 29, 31, 30, 33, 46, 71, 92, 88, 64, 41, 33, 30, 29, 31, 28, 30, 27, 29, 26, 28];
  const p95 = [
    210, 220, 205, 230, 215, 240, 225, 250, 235, 260, 250, 420, 2100, 7800, 8900, 8600, 5200, 1900, 600, 320, 280, 260, 250, 240, 235, 230, 220, 215,
  ];
  const failed = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 4, 18, 41, 66, 58, 31, 9, 3, 1, 0, 1, 0, 0, 1, 0, 0, 0];
  const H = 54;
  const peak = Math.max(...counts);
  const line = (values: number[], top: number) =>
    values.map((v, i) => `${(((i + 0.5) / values.length) * 100).toFixed(2)},${(H - Math.min(1, v / top) * H).toFixed(1)}`).join(" ");
  const rows: [string, string, string, string][] = [
    ["10:42:09.412", "ERROR", "JTS", "Provider order failed for iccid 8990373315287398854: timeout after 8000ms"],
    ["10:42:09.388", "ERROR", "JTS", "Provider order failed for iccid 8990958308297299803: timeout after 8000ms"],
    ["10:42:08.901", "WARN", "JTS", "provider slow: took 2314 ms"],
    ["10:42:08.517", "INFO", "Airalo", "Order created ord-10531"],
    ["10:42:07.240", "ERROR", "JTS", "Provider order failed for iccid 8990112290412880051: timeout after 8000ms"],
    ["10:42:06.903", "INFO", "Telna", "Order created ord-10529"],
  ];
  const level: Record<string, string> = { ERROR: UI.red, WARN: UI.amber, INFO: UI.green };
  const cols = "52px 92px 52px 64px 1fr";
  return (
    <div
      className="relative -mr-28"
      style={{
        // cut off at the right and fading at the foot, as a crop of a bigger window would be
        maskImage: "linear-gradient(90deg, black 70%, transparent 98%), linear-gradient(180deg, black 72%, transparent 100%)",
        maskComposite: "intersect",
      }}
    >
      <div
        className="w-[700px] overflow-hidden rounded-[12px] text-[11px] select-none"
        style={{ background: UI.window, border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 30px 80px rgba(0,0,0,0.55)", color: UI.text }}
      >
        {/* the title bar and the tabs */}
        <div className="flex h-[30px] items-center gap-3 px-3">
          <span className="flex gap-[6px]">
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span key={c} className="size-[10px] rounded-full" style={{ background: c }} />
            ))}
          </span>
          <span className="flex h-[22px] items-center gap-1.5 rounded-[6px] px-2.5" style={{ background: UI.tool }}>
            <span className="size-[7px] rounded-[2px]" style={{ background: UI.key }} />
            orders/laravel.log
          </span>
          <span className="flex items-center gap-1.5 px-1" style={{ color: UI.muted }}>
            gateway/access.jsonl
          </span>
        </div>

        <div className="mx-1.5 mb-1.5 overflow-hidden rounded-[10px]" style={{ background: UI.editor }}>
          {/* the console line */}
          <div className="flex h-[30px] items-center gap-3 font-[var(--font-mono)] text-[11.5px]" style={{ borderBottom: `1px solid ${UI.border}` }}>
            <span className="w-[26px] text-right" style={{ color: UI.muted }}>
              1
            </span>
            <span>
              <span style={{ color: UI.key }}>level</span>
              <span style={{ color: UI.dim }}>:</span>
              <span style={{ color: UI.str }}>ERROR</span>
              <span style={{ color: UI.dim }}> OR </span>
              <span style={{ color: UI.key }}>level</span>
              <span style={{ color: UI.dim }}>:</span>
              <span style={{ color: UI.str }}>WARN</span>
              <span style={{ color: UI.purple }}> | group by </span>
              <span>provider</span>
            </span>
            <span className="ml-auto mr-3 flex items-center gap-1 rounded-[5px] px-2 py-[2px]" style={{ background: UI.hover, color: UI.green }}>
              ▶ <span style={{ color: UI.dim }}>Last 1 hour</span>
            </span>
          </div>

          {/* the timeline, as the app draws it */}
          <div className="px-2.5 pt-1.5 pb-1" style={{ borderBottom: `1px solid ${UI.border}` }}>
            <div className="flex items-center gap-2 pb-1 text-[10px]" style={{ color: UI.muted }}>
              <span>1,238 messages</span>
              <span style={{ color: UI.amber }}>— p95 up to 8.9 s</span>
              <span style={{ color: UI.red }}>— errors up to 41%</span>
              <span className="ml-auto">⌥-drag to explain a spike</span>
            </div>
            <div className="relative flex items-end gap-px" style={{ height: H }}>
              {counts.map((c, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-[1px]"
                  style={{ height: `${Math.max(3, (c / peak) * H)}px`, background: UI.accent, opacity: 0.72 }}
                />
              ))}
              <svg className="pointer-events-none absolute inset-0" width="100%" height={H} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none">
                <polyline points={line(p95, 9000)} fill="none" stroke={UI.amber} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                <polyline points={line(failed, 70)} fill="none" stroke={UI.red} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
              </svg>
              {/* the pull request merged a moment before it started */}
              <div className="absolute top-0 bottom-0" style={{ left: "41%", borderLeft: `1px dashed ${UI.purple}` }}>
                <span className="absolute -top-[3px] -left-[4px] size-[7px] rotate-45" style={{ background: UI.purple }} />
              </div>
            </div>
          </div>

          {/* the rows */}
          <div className="font-[var(--font-mono)] text-[10.5px]">
            <div className="grid h-[22px] items-center" style={{ gridTemplateColumns: cols, background: UI.tool, color: UI.dim }}>
              {["#", "timestamp", "level", "provider", "message"].map((h) => (
                <span key={h} className="truncate px-2" style={{ borderRight: `1px solid ${UI.border}` }}>
                  {h}
                </span>
              ))}
            </div>
            {rows.map(([at, lvl, provider, message], i) => (
              <div
                key={i}
                className="grid h-[21px] items-center"
                style={{ gridTemplateColumns: cols, background: i === 1 ? UI.selection : i % 2 ? UI.stripe : "transparent" }}
              >
                <span className="px-2 text-right" style={{ color: i === 1 ? UI.text : UI.muted }}>
                  {i + 1}
                </span>
                <span className="truncate px-2" style={{ color: i === 1 ? UI.text : UI.dim }}>
                  {at}
                </span>
                <span className="truncate px-2 font-semibold" style={{ color: i === 1 ? UI.text : level[lvl] }}>
                  {lvl}
                </span>
                <span className="truncate px-2">{provider}</span>
                <span className="truncate px-2">{message}</span>
              </div>
            ))}
          </div>
        </div>

        {/* the status bar */}
        <div className="flex h-[20px] items-center gap-3 px-3 text-[10px]" style={{ color: UI.muted }}>
          <span>1,238 rows · 184 ms</span>
          <span className="ml-auto">prod</span>
        </div>
      </div>
    </div>
  );
}

/** GitHub's mark, which lucide no longer ships. */
function GitHubMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * The corner every sign-in screen leaves for its links: the code, a way to report a problem
 * before you are even in, and which version this is. Native tooltips, since the app's own are
 * not drawn until it opens.
 */
function Corner() {
  const [version, setVersion] = useState("");
  const [news, setNews] = useState(false);
  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);
  const go = (url: string) => void openUrl(url).catch(() => {});
  const link = "flex size-7 items-center justify-center rounded-[7px] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]";
  return (
    <div className="absolute right-5 bottom-4 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
      <button className={link} title="Flux on GitHub" aria-label="Flux on GitHub" onClick={() => go(REPO)}>
        <GitHubMark />
      </button>
      <button
        className={link}
        title="Report a problem"
        aria-label="Report a problem"
        onClick={() => go(reportUrl([`Flux ${version || "?"}`, navigator.userAgent, "Reported from the sign-in screen"].join("\n")))}
      >
        <Bug size={15} />
      </button>
      <button className={link} title="What's new" aria-label="What's new" onClick={() => setNews(true)}>
        <Sparkles size={14} />
      </button>
      {version && <span className="ml-1 px-1.5 font-[var(--font-mono)] text-[11px] tabular-nums">v{version}</span>}
      {news && <WhatsNew version={version} onClose={() => setNews(false)} onAll={() => go(`${REPO}/releases`)} />}
    </div>
  );
}

/** What changed in the version on this Mac, from the changelog it was built with. */
function WhatsNew({ version, onClose, onAll }: { version: string; onClose: () => void; onAll: () => void }) {
  const section = changelogSection(changelog, version);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flux-pop flex max-h-[78vh] w-[620px] max-w-full flex-col overflow-hidden rounded-[14px] text-left"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 30px 80px rgba(0,0,0,.55)", color: "var(--text)" }}
      >
        <div className="flex shrink-0 items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div
            className="flex size-9 items-center justify-center rounded-[10px]"
            style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}
          >
            <Sparkles size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">What's new in Flux {section?.version ?? version}</div>
            <div className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              {section && section.version !== version ? `The newest notes; this build is ${version}.` : "The version on this Mac."}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex size-7 items-center justify-center rounded-[7px] hover:bg-[var(--bg-hover)]">
            <X size={15} />
          </button>
        </div>
        <div className="selectable min-h-0 flex-1 overflow-auto px-6 py-4 text-[12.5px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
          {section?.notes ? <Notes source={section.notes} /> : <p>This version came without notes.</p>}
        </div>
        <div className="flex shrink-0 items-center px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <button onClick={onAll} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--accent)" }}>
            <GitHubMark size={13} /> All releases
          </button>
          <button
            onClick={onClose}
            className="ml-auto h-[30px] rounded-[7px] px-4 text-[12.5px] font-medium"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/** What Flux says about itself, one thing at a time. */
const PITCH: { title: [string, string]; text: string }[] = [
  {
    title: ["Your logs,", "read like code."],
    text: "Graylog, Elasticsearch or the files on your Mac — searched, explained, and traced to the line of code that wrote them.",
  },
  {
    title: ["From a log line", "to the fix."],
    text: "Investigate gathers the request across services, who else it hits and the commit behind it — then hands the case to Claude Code.",
  },
  {
    title: ["Your architecture,", "drawn from your logs."],
    text: "The service map joins services by the ids they already log. No agent, no tracing library, nothing to install.",
  },
  {
    title: ["Why is this spike", "different?"],
    text: "Drag across it with ⌥ held, and Flux tells you which version, provider or host it comes from.",
  },
  {
    title: ["One ID,", "every service."],
    text: "Paste an ICCID, an order or a request id, and read its whole story across every stream — the failures in red.",
  },
];

/** How long each line of the pitch stays before the next one takes its place. */
const PITCH_MS = 6500;

/**
 * The pitch, turning over on its own. Every line is drawn in the same place and only the one on
 * show is visible, so the block keeps the height of its longest line and nothing below it moves.
 * Holding the pointer over it holds it; reduced motion keeps it on the first.
 */
function Pitch() {
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState(false);
  const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (held || still) return;
    const turn = setTimeout(() => setAt((i) => (i + 1) % PITCH.length), PITCH_MS);
    return () => clearTimeout(turn);
  }, [at, held, still]);

  return (
    // the words sit on frosted glass, so the streams pass behind them without crossing them
    <div
      className="flex max-w-[480px] flex-col gap-4 self-start rounded-[16px] px-5 py-4"
      style={GLASS}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
    >
      <div className="grid">
        {PITCH.map((p, i) => {
          const on = i === at;
          return (
            <div
              key={i}
              aria-hidden={!on}
              className="flex flex-col gap-3"
              style={{
                gridArea: "1 / 1",
                opacity: on ? 1 : 0,
                transform: on ? "translateY(0)" : i === (at + PITCH.length - 1) % PITCH.length ? "translateY(-10px)" : "translateY(12px)",
                filter: on ? "blur(0)" : "blur(6px)",
                transition: "opacity 700ms ease, transform 900ms cubic-bezier(.22,.8,.2,1), filter 700ms ease",
                pointerEvents: on ? undefined : "none",
              }}
            >
              <h2 className="text-[34px] leading-[1.12] font-semibold tracking-tight">
                {p.title[0]}
                <br />
                {p.title[1]}
              </h2>
              <p className="max-w-[440px] text-[14px] leading-relaxed" style={{ color: "#b8bcc4" }}>
                {p.text}
              </p>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        {PITCH.map((_, i) => (
          <button
            key={i}
            onClick={() => setAt(i)}
            aria-label={`Show line ${i + 1}`}
            className="h-[5px] rounded-full transition-all duration-500"
            style={{ width: i === at ? 20 : 6, background: i === at ? BRAND : "rgba(255,255,255,0.22)" }}
          />
        ))}
      </div>
    </div>
  );
}

/** The two steps, so it is plain where in signing in you are. */
function Steps({ at }: { at: 1 | 2 | 3 }) {
  const step = (n: 1 | 2 | 3, label: string) => {
    // the last step is done the moment it is reached: there is nothing left to do in it
    const done = at > n || (at === 3 && n === 3);
    return (
      <span className="flex items-center gap-1.5" style={{ color: at >= n ? "var(--text)" : "var(--text-muted)" }}>
        <span
          className="flex size-[18px] items-center justify-center rounded-full text-[10.5px] font-semibold transition-colors duration-500"
          style={{
            background: done ? "var(--accent)" : at === n ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "var(--bg-hover)",
            color: done ? "var(--accent-text)" : at === n ? "var(--accent)" : "var(--text-muted)",
          }}
        >
          {done ? "✓" : n}
        </span>
        {label}
      </span>
    );
  };
  const line = (after: number) => (
    <span className="h-px w-5 transition-colors duration-500" style={{ background: at > after ? "var(--accent)" : "var(--border)" }} />
  );
  return (
    <div className="mb-6 flex items-center gap-2 text-[12px]">
      {step(1, "Email")}
      {line(1)}
      {step(2, "Confirm")}
      {line(2)}
      {step(3, "You're in")}
    </div>
  );
}

/** The quips the last step picks one of, so it does not say the same thing every time. */
const QUIPS = [
  "Your logs have been waiting. Patiently. Mostly.",
  "No password was harmed in the making of this sign-in.",
  "The stack traces are where you left them. Sorry.",
  "Grab a coffee — or don't, the logs are already here.",
];

/** Step three: in. A moment to say so, then the window opens on its own. */
function Welcome({ email, onIn }: { email: string; onIn: () => void }) {
  const [quip] = useState(() => QUIPS[Math.floor(Math.random() * QUIPS.length)]);
  useEffect(() => {
    const go = setTimeout(onIn, 4200);
    return () => clearTimeout(go);
  }, [onIn]);
  return (
    <>
      <Steps at={3} />
      <div className="flux-pop relative mb-6 flex size-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full blur-xl" style={{ background: "color-mix(in srgb, var(--accent) 45%, transparent)" }} />
        <svg width="64" height="64" viewBox="0 0 64 64" className="relative">
          <circle cx="32" cy="32" r="29" fill="var(--accent)" />
          <path
            d="M20 33 L28.5 41 L44 24"
            fill="none"
            stroke="var(--accent-text)"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flux-draw"
          />
        </svg>
        {/* a few sparks, for the occasion */}
        {[
          [-26, -18, 0],
          [30, -24, 80],
          [36, 14, 160],
          [-32, 20, 240],
        ].map(([x, y, delay], i) => (
          <span
            key={i}
            className="flux-spark absolute size-[6px] rounded-full"
            style={{ left: 32 + x, top: 32 + y, background: i % 2 ? "#22C8B2" : "var(--accent)", animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
      <h1 className="text-[28px] font-semibold tracking-tight">Voilà — you're in.</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
        {quip}
      </p>
      {email && (
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          Signed in as {email}
        </p>
      )}
      <button
        onClick={onIn}
        className="mt-8 flex h-[42px] items-center justify-center gap-2 rounded-[8px] text-[13.5px] font-medium"
        style={{ background: "var(--accent)", color: "var(--accent-text)" }}
      >
        Take me to my logs <ArrowRight size={15} />
      </button>
    </>
  );
}

function Problem({ children }: { children: ReactNode }) {
  return (
    <p
      className="mt-3 rounded-[8px] px-3 py-2 text-[12px] leading-snug"
      style={{ background: "color-mix(in srgb, var(--red) 12%, transparent)", color: "var(--red)" }}
    >
      {children}
    </p>
  );
}

function Door({
  state,
  onRetry,
  onSignedOut,
  onLink,
  welcome,
  onIn,
  onSkip,
}: {
  state: AuthState;
  onRetry: () => void;
  onSignedOut: (error?: string) => void;
  onLink: (url: string) => void;
  welcome: boolean;
  onIn: () => void;
  onSkip?: () => void;
}) {
  if (welcome && state.status === "signed-in") return <Welcome email={state.email} onIn={onIn} />;
  if (state.status === "checking" || state.status === "signed-in") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="md:hidden">
          <Logo size={44} />
        </div>
        <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-dim)" }}>
          <Spinner /> {state.status === "checking" ? "Checking your session…" : "Bringing your settings…"}
        </div>
      </div>
    );
  }
  if (state.status === "unconfigured") {
    return (
      <p className="text-[13px]" style={{ color: "var(--text-dim)" }}>
        This build of Flux has no account service configured.
      </p>
    );
  }
  if (state.status === "unreachable") {
    return (
      <>
        <div
          className="mb-5 flex size-11 items-center justify-center rounded-[12px]"
          style={{ background: "color-mix(in srgb, var(--amber) 16%, transparent)", color: "var(--amber)" }}
        >
          <WifiOff size={20} />
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight">Can't reach Flux's account service</h1>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
          Signing in is checked every time Flux opens. Check your connection, then try again.
        </p>
        <p className="mt-3 truncate font-[var(--font-mono)] text-[11px]" style={{ color: "var(--text-muted)" }} title={state.error}>
          {state.error}
        </p>
        <button
          onClick={onRetry}
          className="mt-6 flex h-[40px] items-center justify-center gap-2 rounded-[8px] text-[13.5px] font-medium"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          <RotateCw size={14} /> Try again
        </button>
      </>
    );
  }
  return <SignIn error={state.error} onError={onSignedOut} onLink={onLink} onSkip={onSkip} />;
}

function SignIn({
  error,
  onError,
  onLink,
  onSkip,
}: {
  error?: string;
  onError: (error?: string) => void;
  onLink: (url: string) => void;
  onSkip?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");

  useEffect(() => {
    if (wait <= 0) return;
    const tick = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(tick);
  }, [wait]);

  const send = async (to: string) => {
    if (!isEmail(to) || busy) return;
    setBusy(true);
    try {
      await sendLink(to);
      setSent(to.trim());
      setWait(RESEND);
      onError(undefined);
    } catch (e) {
      onError(failureReason(e));
    } finally {
      setBusy(false);
    }
  };

  const field =
    "h-[42px] w-full rounded-[8px] text-[13.5px] outline-none transition-[border-color,box-shadow] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_45%,transparent)]";
  const box = { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)" } as const;

  if (sent) {
    return (
      <>
        <Steps at={2} />
        <div
          className="mb-5 flex size-12 items-center justify-center rounded-[14px]"
          style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}
        >
          <Mail size={22} />
        </div>
        <h1 className="text-[24px] font-semibold tracking-tight">Check your inbox</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "var(--text-dim)" }}>
          We sent a sign-in link to
          <span className="flex items-center gap-1.5 rounded-full py-0.5 pr-1 pl-2.5" style={{ background: "var(--bg-hover)", color: "var(--text)" }}>
            {sent}
            <button
              onClick={() => setSent(null)}
              className="rounded-full px-2 text-[11.5px] hover:bg-[var(--bg-active)]"
              style={{ color: "var(--accent)" }}
            >
              change
            </button>
          </span>
        </div>

        <ol className="mt-6 flex flex-col gap-2.5 text-[13px]">
          {["Open the email on this Mac", "Click “Sign in to Flux”", "You're brought back here, signed in"].map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              <span
                className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                style={{ background: "var(--bg-hover)", color: "var(--text-dim)" }}
              >
                {i + 1}
              </span>
              <span style={{ color: "var(--text-dim)" }}>{s}</span>
            </li>
          ))}
        </ol>

        {error && <Problem>{error}</Problem>}

        <div className="mt-7 flex items-center gap-3">
          <button
            disabled={wait > 0 || busy}
            onClick={() => void send(sent)}
            className="relative flex h-[38px] flex-1 items-center justify-center gap-2 overflow-hidden rounded-[8px] text-[13px] disabled:cursor-default"
            style={{ background: "var(--bg-hover)", color: wait > 0 ? "var(--text-muted)" : "var(--text)" }}
          >
            {/* the wait drains away under the button, so the countdown is felt rather than read */}
            {wait > 0 && (
              <span
                className="absolute inset-y-0 left-0 transition-[width] duration-1000 ease-linear"
                style={{ width: `${(wait / RESEND) * 100}%`, background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {busy ? <Spinner /> : <RotateCw size={13} />}
              {wait > 0 ? `Send again in ${wait}s` : "Send again"}
            </span>
          </button>
        </div>
        <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          The link is good for 15 minutes. Nothing there? Look in spam.
        </p>

        {/* the link can land somewhere else — another copy of Flux, a browser that will not hand
            it over — and the address it ended on is enough to finish here */}
        <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <button onClick={() => setPasting((v) => !v)} className="flex w-full items-center gap-2 text-[12px]" style={{ color: "var(--text-dim)" }}>
            <Link2 size={13} />
            The link opened somewhere else?
            <ChevronDown size={13} className="ml-auto transition-transform" style={{ transform: pasting ? "rotate(180deg)" : undefined }} />
          </button>
          {pasting && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (pasted.trim().startsWith(AUTH_CALLBACK)) onLink(pasted.trim());
              }}
            >
              <input
                autoFocus
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="flux://auth/callback?code=…"
                spellCheck={false}
                className="h-[34px] min-w-0 flex-1 rounded-[7px] px-2.5 font-[var(--font-mono)] text-[11.5px] outline-none focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
                style={box}
              />
              <button
                type="submit"
                disabled={!pasted.trim().startsWith(AUTH_CALLBACK)}
                className="h-[34px] shrink-0 rounded-[7px] px-3 text-[12px] font-medium disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--accent-text)" }}
              >
                Sign in
              </button>
            </form>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <Steps at={1} />
      <div className="mb-5 md:hidden">
        <Logo size={40} />
      </div>
      <h1 className="text-[26px] font-semibold tracking-tight">Sign in to Flux</h1>
      <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
        No password. We email you a link, and it signs you in on this Mac.
      </p>
      <form
        className="mt-7 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(email);
        }}
      >
        <label className="text-[12px] font-medium" style={{ color: "var(--text-dim)" }} htmlFor="flux-email">
          Work email
        </label>
        <div className="relative">
          <Mail size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            id="flux-email"
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            spellCheck={false}
            className={`${field} pr-3 pl-9`}
            style={box}
          />
        </div>
        <button
          type="submit"
          disabled={!isEmail(email) || busy}
          className="mt-1 flex h-[42px] items-center justify-center gap-2 rounded-[8px] text-[13.5px] font-medium transition-opacity disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          {busy ? <Spinner /> : null}
          Continue with email
          {!busy && <ArrowRight size={15} />}
        </button>
        {import.meta.env.DEV && onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="flex h-[36px] items-center justify-center rounded-[8px] text-[12.5px] hover:bg-[var(--bg-hover)]"
            style={{ border: "1px dashed var(--border)", color: "var(--text-dim)" }}
          >
            Skip sign-in (dev only)
          </button>
        )}
      </form>
      {error && <Problem>{error}</Problem>}
      <p className="mt-8 flex items-start gap-2 text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        <Lock size={12} className="mt-[2px] shrink-0" />
        Your preferences follow you to every Mac you sign in on. Connections, tokens and queries never leave this one.
      </p>
    </>
  );
}

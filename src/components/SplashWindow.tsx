// The splash window: Flux's name and version over the sign-in panel's own colours, up while the
// main window loads behind it and asks whether there is an update to take first. It holds no
// state of its own; the main window says what it is doing and when it is ready.
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { Logo } from "./Logo";

const BRAND = "#22C8B2";

export function SplashWindow() {
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState("Starting…");

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => {});
    const stop = listen<string>("splash-status", (e) => setStatus(e.payload));
    return () => void stop.then((s) => s());
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="relative flex h-screen w-screen flex-col justify-between overflow-hidden rounded-[14px] p-9 select-none"
      style={{
        background: "linear-gradient(160deg, #15171c 0%, #0d0e11 60%, #0b0c0f 100%)",
        color: "#e8e9ec",
        fontFamily: "var(--font-ui)",
      }}
    >
      {/* the aurora of the sign-in panel, painted as gradients: nothing here needs a filter */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            `radial-gradient(ellipse 60% 70% at 15% 10%, ${BRAND}55, transparent 65%)`,
            "radial-gradient(ellipse 55% 60% at 95% 55%, #3b6cf055, transparent 65%)",
            "radial-gradient(ellipse 50% 50% at 45% 110%, #7b4fd644, transparent 65%)",
          ].join(", "),
        }}
      />
      {/* a few of its streams, still */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 560 340" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="splash-stream" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={BRAND} stopOpacity="0" />
            <stop offset="0.4" stopColor={BRAND} stopOpacity="0.9" />
            <stop offset="0.75" stopColor="#8CF7E2" stopOpacity="0.7" />
            <stop offset="1" stopColor="#3b6cf0" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M-20,${150 + i * 34} C120,${110 + i * 34} 240,${210 + i * 30} 380,${150 + i * 32} S560,${120 + i * 34} 600,${160 + i * 30}`}
            fill="none"
            stroke="url(#splash-stream)"
            strokeWidth={i === 2 ? 1.4 : 0.8}
            strokeOpacity={0.14 + (i % 2) * 0.18}
          />
        ))}
      </svg>

      <div className="relative flex items-start justify-between">
        <div>
          <h1 className="text-[52px] leading-none font-semibold tracking-tight">Flux</h1>
          <p className="mt-3 text-[16px] tabular-nums" style={{ color: "#b8bcc4" }}>
            {version}
          </p>
        </div>
        <Logo size={56} />
      </div>

      <div className="relative flex items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="truncate text-[12px]" style={{ color: "#8e939c" }}>
            {status}
          </p>
        </div>
        {/* an indeterminate bar, as the status bar's tasks have */}
        <span className="relative h-[3px] w-[120px] shrink-0 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.12)" }}>
          <span className="progress-drift absolute top-0 h-full w-[35%] rounded-full" style={{ background: BRAND }} />
        </span>
      </div>
    </div>
  );
}

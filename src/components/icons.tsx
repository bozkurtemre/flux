// 16px flat icons shaped like the JetBrains set: a rack for a connection, which is a host
// we query rather than a database, a box for a grouping, a grid for a stream.

const S = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none" } as const;

export function ConnectionIcon({ live, failed }: { live?: boolean; failed?: boolean }) {
  // the only thing the tree says about a failure: red here, the reason is in the balloon
  const c = failed ? "var(--red)" : live ? "var(--green)" : "var(--text-muted)";
  return (
    <svg {...S}>
      <rect x="2" y="2.6" width="12" height="4.6" rx="1.2" fill={c} opacity={0.9} />
      <rect x="2" y="8.8" width="12" height="4.6" rx="1.2" fill={c} opacity={0.9} />
      <circle cx="4.4" cy="4.9" r="0.85" fill="var(--bg-tool)" />
      <circle cx="4.4" cy="11.1" r="0.85" fill="var(--bg-tool)" />
    </svg>
  );
}

export function ProjectIcon() {
  return (
    <svg {...S}>
      <path d="M2 5.2 8 2.2l6 3v5.6l-6 3-6-3z" fill="var(--purple)" opacity={0.85} />
      <path d="M2 5.2 8 8.2l6-3M8 8.2v5.6" stroke="var(--bg-tool)" strokeWidth="1.1" />
    </svg>
  );
}

export function StreamIcon() {
  return (
    <svg {...S}>
      <rect x="2" y="3" width="12" height="10" rx="1.4" fill="var(--cyan)" opacity={0.85} />
      <path d="M2 6.4h12M6.2 6.4V13M10 6.4V13" stroke="var(--bg-tool)" strokeWidth="1.1" />
    </svg>
  );
}

export function EndpointIcon({ tone }: { tone?: "ok" | "warn" | "bad" }) {
  const c = tone === "bad" ? "var(--red)" : tone === "warn" ? "var(--amber)" : "var(--text-dim)";
  return (
    <svg {...S}>
      <rect x="3" y="2.5" width="4" height="11" rx="1.2" fill={c} opacity={0.9} />
      <path d="M9 5.5h4M9 8h4M9 10.5h2.5" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity={0.7} />
    </svg>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 90ms" }}
    >
      <path d="M4.5 3 8 6l-3.5 3" stroke="var(--text-dim)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" className="animate-spin">
      <circle cx="6" cy="6" r="4.5" stroke="var(--text-muted)" strokeWidth="1.5" fill="none" opacity={0.3} />
      <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function RunIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M4.5 3.2 12.5 8l-8 4.8z" fill="var(--green)" />
    </svg>
  );
}

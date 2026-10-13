import type { SourceKind } from "@/lib/datasource";
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

/**
 * The Model Context Protocol mark, from the protocol's own favicon: three strokes, drawn in
 * whatever colour the caller is using rather than on its black tile.
 */
export function McpIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 180 180" fill="none" aria-label="MCP">
      <g stroke="currentColor" strokeWidth="14" strokeLinecap="round" fill="none">
        <path d="M23.6 85.25 86.2 22.65c8.64-8.64 22.66-8.64 31.3 0 8.64 8.64 8.64 22.66 0 31.3L70.23 101.23" />
        <path d="M70.88 100.58 117.5 53.95c8.64-8.64 22.66-8.64 31.3 0l.33.33c8.64 8.64 8.64 22.66 0 31.3l-56.62 56.62c-2.88 2.88-2.88 7.55 0 10.43l11.63 11.63" />
        <path d="M101.85 38.3 55.55 84.6c-8.64 8.64-8.64 22.66 0 31.3 8.65 8.64 22.66 8.64 31.3 0l46.3-46.3" />
      </g>
    </svg>
  );
}

/**
 * Claude's mark, in its own orange so it reads as Claude rather than as one more grey glyph.
 * The path is the official one, as Simple Icons (CC0) carries it, traced from claude.ai.
 */
export function ClaudeIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Claude">
      <path
        fill="#D97757"
        d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"
      />
    </svg>
  );
}

/** The mark of a connection's kind of source, beside its name wherever the kind is chosen. */
export function SourceIcon({ kind, size = 12 }: { kind: SourceKind; size?: number }) {
  if (kind === "local") {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Local" className="shrink-0">
        <rect x="3" y="5" width="26" height="22" rx="4" fill="#5fb865" />
        <path d="M9 13l4 3-4 3M16 20h7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }
  if (kind === "kibana") {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Kibana" className="shrink-0">
        <path fill="#F04E98" d="M4 0v28.789L28.935.017z" />
        <path fill="#343741" d="M4 12v16.789l11.906-13.738A24.721 24.721 0 0 0 4 12" />
        <path fill="#00BFB3" d="M18.479 16.664 6.268 30.754 5.215 32h24.044c-1.33-6.638-5.258-12.354-10.78-15.336" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Graylog" className="shrink-0">
      <circle cx="16" cy="16" r="15" fill="#FF3633" />
      <path d="M5 17h5l3-7 4 13 3-9 2 3h5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

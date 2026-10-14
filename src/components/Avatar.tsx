// The account's picture, from wherever it is: the addresses are tried in order, and when none
// answers — no picture at GitHub, Google or Gravatar — the first letter of the address stands in.
import { useState } from "react";

export function Avatar({ urls, letter, size }: { urls: string[] | undefined; letter: string; size: number }) {
  const [failed, setFailed] = useState(0);
  const url = urls?.[failed];
  return url ? (
    <img
      key={url}
      src={url}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed((n) => n + 1)}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size, background: "var(--bg-hover)" }}
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold uppercase"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: "color-mix(in srgb, var(--accent) 22%, transparent)",
        color: "var(--accent)",
      }}
    >
      {letter || "?"}
    </span>
  );
}

// From a log line to the line of code that wrote it. A stack trace names its files as the
// server saw them — `/var/www/html/app/Services/Activation.php:142` — and the same file is
// sitting in the project's checkout on this machine; what is left is to tell the IDE.

export type Ide = "phpstorm" | "idea" | "webstorm" | "vscode" | "cursor";

export const IDES: { value: Ide; label: string }[] = [
  { value: "phpstorm", label: "PhpStorm" },
  { value: "idea", label: "IntelliJ IDEA" },
  { value: "webstorm", label: "WebStorm" },
  { value: "vscode", label: "Visual Studio Code" },
  { value: "cursor", label: "Cursor" },
];

export interface SourceRef {
  /** As the log wrote it. */
  path: string;
  line: number;
}

const EXT = "php|phtml|js|mjs|cjs|ts|tsx|jsx|vue|py|go|rb|java|kt|rs|cs|swift|scala|ex|exs";
// `file.php:12`, `file.php(12)` and `file.php line 12`, the three shapes a trace comes in
const REF = new RegExp(`((?:[A-Za-z]:)?[\\w@.\\-/\\\\]*[\\w\\-]\\.(?:${EXT}))(?::|\\(|\\s+on\\s+line\\s+|\\s+line\\s+)(\\d+)`, "g");

/** Every file and line a piece of text names, in order and once each. */
export function sourceRefs(text: string): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const m of text.matchAll(REF)) {
    const path = m[1].replace(/\\\\/g, "/").replace(/\\/g, "/");
    const line = Number(m[2]);
    // `vendor/…` is someone else's code: worth keeping, but after ours
    const key = `${path}:${line}`;
    if (!line || seen.has(key)) continue;
    seen.add(key);
    out.push({ path, line });
  }
  return out.sort((a, b) => Number(a.path.includes("vendor/")) - Number(b.path.includes("vendor/")));
}

/** Where a server usually keeps the code, which is the part that is not in the checkout. */
const ROOTS = ["/var/www/html/", "/var/www/", "/app/", "/srv/app/", "/srv/", "/code/", "/usr/src/app/", "/opt/app/"];

/**
 * The file on this machine. The project's own prefix is taken off first, then the usual server
 * roots; what is left is a path inside the checkout. A path that matches none of them is left
 * as it was, which for a local run is exactly right.
 */
export function localPath(logged: string, folder: string, prefix = ""): string {
  const roots = [prefix, ...ROOTS].filter(Boolean).map((r) => (r.endsWith("/") ? r : `${r}/`));
  const root = roots.find((r) => logged.startsWith(r));
  const inside = root ? logged.slice(root.length) : logged.startsWith("/") ? null : logged;
  if (inside === null) return logged;
  return `${folder.replace(/\/+$/, "")}/${inside.replace(/^\.?\//, "")}`;
}

/** What the IDE is asked to open, in the scheme it registered for itself. */
export function ideUrl(ide: Ide, file: string, line: number): string {
  if (ide === "vscode" || ide === "cursor") return `${ide}://file${encodeURI(file)}:${line}`;
  return `${ide}://open?file=${encodeURIComponent(file)}&line=${line}`;
}

/** The IDE's name, for a menu that says what it will open. */
export const ideName = (ide: Ide) => IDES.find((i) => i.value === ide)?.label ?? ide;

// Work the window is doing on your behalf, and what it has to say when it goes wrong. The
// shapes and the two decisions about them live here; the screen only draws them.

/** Something running in the background. Without a progress it is drawn as indeterminate. */
export interface Task {
  id: string;
  title: string;
  /** 0 to 1, when the work knows how much of it is left. */
  progress?: number;
  /** Present only when the work can actually be stopped, so the button is never a decoration. */
  cancel?: () => void;
}

export type NoticeKind = "error" | "warning" | "info";

/** One balloon: what happened, in the words of whatever it happened to. */
export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  message: string;
  /** Offered alongside the message, as an update does. */
  actions?: { label: string; run: () => void }[];
}

/** The status bar has room for one: the newest, which is the one you just caused. */
export const visibleTask = (tasks: Task[]): Task | undefined => tasks[tasks.length - 1];

/** The others are counted rather than listed, as the IDE does when work piles up. */
export function taskLabel(tasks: Task[]): string {
  const task = visibleTask(tasks);
  if (!task) return "";
  return tasks.length > 1 ? `${task.title} (+${tasks.length - 1})` : task.title;
}

/**
 * The same failure from the same source is one balloon, not a stack of them: a connection
 * that times out while three branches are open would otherwise say so three times.
 */
export function withNotice(list: Notice[], notice: Notice): Notice[] {
  if (list.some((n) => n.kind === notice.kind && n.title === notice.title && n.message === notice.message)) return list;
  return [...list, notice];
}

/**
 * Whatever was thrown, as something a person can read. Tauri rejects with the Rust error as
 * a plain string rather than an Error, which is how a failed connection reached the screen
 * as a balloon with a name on it and nothing underneath.
 */
export function errorText(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  if (typeof e === "string" && e.trim()) return e.trim();
  if (e && typeof e === "object") {
    const message = (e as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "No reason given.";
}

/** The handful of ways a Graylog behind a VPN actually fails, in words rather than in a
 * chain of wrapped Rust errors. Anything else is passed through as it came. */
const REASONS: [RegExp, string][] = [
  [/timed out|timeout/i, "Operation timed out."],
  [/connection refused/i, "Connection refused."],
  [/no route to host|network is unreachable|host is down/i, "The host could not be reached."],
  [/dns error|failed to lookup|nodename nor servname|name or service not known/i, "The host name could not be resolved."],
  [/certificate|self-signed|tls|ssl/i, "The TLS certificate was rejected."],
  [/\b401\b|unauthorized/i, "The access token was rejected."],
  [/\b403\b|forbidden/i, "The access token is not allowed to read this."],
  [/\b404\b/i, "Graylog has no such resource; check the URL."],
];

export function failureReason(e: unknown): string {
  const text = errorText(e);
  for (const [pattern, reason] of REASONS) if (pattern.test(text)) return reason;
  return text;
}

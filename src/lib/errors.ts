// The errors a project has had, by template, and the one it has never had before. Every few
// minutes each project's failures since the last look are counted under their templates
// (lib/patterns), and a template the project has not logged in the day before, or since it was
// resolved, is news: the question after a deploy is not how many errors there are but whether
// there is a new one.
//
// The ledger is derived from the logs, so it is kept in the cache directory, one file per
// project. What it adds of its own is a resolved mark; clearing the cache forgets those, and
// the next look takes a new day as what the project already knew.
import { invoke } from "@tauri-apps/api/core";
import { literalsOf } from "./located";
import { templateOf } from "./patterns";
import { quotedValue } from "./query";
import { identifying, leaf, NAME_LABELS, NAMES } from "./correlation";
import type { Marker } from "./deploys";

export const LEDGER_FORMAT = 1;
/** How far back the first look reads, and the most any later look reads after a long gap. */
export const BASELINE_MS = 24 * 60 * 60_000;
/** A new error is put down to a merge into the project's repository this long before it. */
export const DEPLOY_MS = 2 * 60 * 60_000;
// ponytail: a project keeps its most recently seen 500 templates; a rarer one that drops out
// is new again the next time, which is a false alarm a month later rather than a big file
const KEEP = 500;
const HOUR = 3_600_000;
/** Escalating: this many times its usual hourly rate, and at least FLOOR lines in the last hour. */
const ESCALATE = 4;
const FLOOR = 10;
/** Hours of history an error needs before its usual rate means anything. */
const HISTORY = 6;

export interface KnownError {
  template: string;
  /** One real line behind the template. */
  sample: string;
  firstSeen: number;
  lastSeen: number;
  /** Lines seen under it since it was first seen, as far as the looks read. */
  count: number;
  resolvedAt?: number;
  /** Not seen before (`new`), seen again after it was resolved (`back`), or several times its
   *  usual rate (`escalating`), and not yet looked at. */
  news?: "new" | "back" | "escalating";
  /** The merge it first appeared after, when there was one shortly before. */
  deploy?: Marker;
  /** Lines per hour, as [the hour's start, lines], over the last two days. */
  hours?: [number, number][];
  /** Running at several times its usual rate, until it calms down. */
  escalating?: boolean;
  /** Announced again only after this, whatever it does. */
  snoozedUntil?: number;
  /** Announced again only if it escalates. */
  ignored?: boolean;
}

const hourOf = (t: number) => Math.floor(t / HOUR) * HOUR;

/** Snoozed or ignored: kept out of the open list, and out of the announcements. */
export const muted = (e: KnownError, now: number) => !!e.ignored || (e.snoozedUntil ?? 0) > now;

/**
 * The last hour's lines against its usual hourly rate over the day before; null for an error too
 * young for a usual rate to mean anything.
 */
export function rateOf(e: Pick<KnownError, "hours" | "firstSeen">, now: number): { lastHour: number; usual: number } | null {
  const hours = new Map(e.hours ?? []);
  const current = hourOf(now);
  // the hour before only counts for the part of it that is within the last sixty minutes
  const lastHour = (hours.get(current) ?? 0) + (hours.get(current - HOUR) ?? 0) * (1 - (now - current) / HOUR);
  const history = (current - HOUR - Math.max(e.firstSeen, current - 25 * HOUR)) / HOUR;
  if (history < HISTORY) return null;
  let before = 0;
  for (const [t, n] of hours) if (t < current - HOUR && t >= current - 25 * HOUR) before += n;
  return { lastHour, usual: before / Math.min(24, history) };
}

/** Several times its usual rate, and enough lines that it is not noise. */
export const escalates = (r: { lastHour: number; usual: number }) => r.lastHour >= FLOOR && r.lastHour >= ESCALATE * Math.max(r.usual, 1);
/** Back near its usual rate. */
const calm = (r: { lastHour: number; usual: number }) => r.lastHour < 2 * Math.max(r.usual, 1);

export interface ErrorLedger {
  format: typeof LEDGER_FORMAT;
  /** What counts as a failure in this project's lines (lib/monitor's errorQueryFrom). */
  query: string;
  /** The field the messages are in. */
  field: string;
  /** Read up to here; the next look starts from it. */
  checkedTo: number;
  errors: Record<string, KnownError>;
}

const key = (projectId: string) => `errors-${projectId}`;

/** The project's ledger as the last look left it, or null for one never looked at. */
export async function readLedger(projectId: string): Promise<ErrorLedger | null> {
  try {
    const raw = await invoke<string | null>("cache_read", { key: key(projectId) });
    const ledger = raw ? (JSON.parse(raw) as ErrorLedger) : null;
    // a format bump is a discard: the next look takes a new day as what was known
    return ledger?.format === LEDGER_FORMAT ? ledger : null;
  } catch {
    return null;
  }
}

export async function writeLedger(projectId: string, ledger: ErrorLedger): Promise<void> {
  await invoke("cache_write", { key: key(projectId), value: JSON.stringify(ledger) }).catch(() => {});
}

export function emptyLedger(query: string, field: string): ErrorLedger {
  return { format: LEDGER_FORMAT, query, field, checkedTo: 0, errors: {} };
}

/**
 * The rows of one look folded into the ledger. The first look (`checkedTo` 0) is what the project
 * already knew and announces nothing; after it, a template not in the ledger is new, one seen
 * after it was resolved is back, and one running at several times its usual rate is escalating.
 * A snoozed error is news of none of these; an ignored one only of escalating. Returns the ledger
 * to keep and what is news on this look.
 */
export function absorb(ledger: ErrorLedger, rows: Record<string, unknown>[], now: number): { ledger: ErrorLedger; news: KnownError[] } {
  const first = ledger.checkedTo === 0;
  const errors = { ...ledger.errors };
  const news = new Map<string, KnownError>();
  const hours = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const text = row[ledger.field];
    if (text == null || text === "") continue;
    const template = templateOf(text);
    if (!template) continue;
    const parsed = new Date(String(row.timestamp ?? "")).getTime();
    const at = Number.isNaN(parsed) ? now : parsed;
    const known = errors[template];
    const counted = hours.get(template) ?? new Map(known?.hours ?? []);
    counted.set(hourOf(at), (counted.get(hourOf(at)) ?? 0) + 1);
    hours.set(template, counted);
    if (!known) {
      errors[template] = { template, sample: String(text), firstSeen: at, lastSeen: at, count: 1, ...(first ? {} : { news: "new" as const }) };
      if (!first) news.set(template, errors[template]);
      continue;
    }
    const next: KnownError = { ...known, count: known.count + 1, firstSeen: Math.min(known.firstSeen, at), lastSeen: Math.max(known.lastSeen, at) };
    if (known.resolvedAt != null && at > known.resolvedAt) {
      delete next.resolvedAt;
      next.news = "back";
      next.sample = String(text);
      news.set(template, next);
    }
    errors[template] = next;
  }
  for (const [template, counted] of hours) {
    errors[template] = { ...errors[template], hours: [...counted].filter(([t]) => t >= hourOf(now) - 48 * HOUR).sort((a, b) => a[0] - b[0]) };
  }
  // escalating, or calm again: every error is asked, the ones quiet on this look included
  if (!first) {
    for (const e of Object.values(errors)) {
      if (e.news === "new" || news.has(e.template)) continue;
      const rate = rateOf(e, now);
      if (!rate) continue;
      if (!e.escalating && escalates(rate)) {
        const announced = (e.snoozedUntil ?? 0) <= now;
        errors[e.template] = { ...e, escalating: true, ...(announced ? { news: "escalating" as const } : {}) };
        if (announced) news.set(e.template, errors[e.template]);
      } else if (e.escalating && calm(rate)) {
        errors[e.template] = { ...e, escalating: false, ...(e.news === "escalating" ? { news: undefined } : {}) };
      }
    }
  }
  const kept = Object.values(errors)
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, KEEP);
  return {
    ledger: { ...ledger, checkedTo: now, errors: Object.fromEntries(kept.map((e) => [e.template, e])) },
    news: [...news.values()].map((e) => errors[e.template]).filter((e) => kept.includes(e)),
  };
}

/** The latest merge in the two hours before an error was first seen. */
export function deployBefore(merges: Marker[], at: number): Marker | undefined {
  return merges
    .filter((m) => {
      const t = new Date(m.at).getTime();
      return t <= at && at - t <= DEPLOY_MS;
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
}

/** The console line that finds an error's lines: the project's failures, narrowed to its longest literal words. */
export function errorQuery(ledger: Pick<ErrorLedger, "query" | "field">, template: string): string {
  const literal = literalsOf(template, 1)[0];
  return literal ? `(${ledger.query}) AND ${ledger.field}:${quotedValue(literal)}` : ledger.query;
}

/** Errors as they are listed: news first, then the escalating, the open by when they were last seen, the resolved last. */
export function listed(errors: KnownError[]): KnownError[] {
  const rank = (e: KnownError) => (e.news ? 0 : e.escalating ? 1 : e.resolvedAt == null ? 2 : 3);
  return [...errors].sort((a, b) => rank(a) - rank(b) || b.lastSeen - a.lastSeen);
}

/** Fields an error's lines are told apart by, best first: where, on what, which version, where it runs. */
const TELLING = [
  /^(route|path|uri|url|endpoint|request[_.]?path)$/i,
  /^(host|hostname|host\.name|source|pod|container)$/i,
  /(^|[._])(app[_.]?)?version$|^release$/i,
  /^(env|environment)$/i,
  /^(service|app|application|service\.name)$/i,
];
/** What says nothing about who an error hits: when, what it said, which line it is, its level. */
const SILENT =
  /^(timestamp|@timestamp|message|full_message|_id|gl2_.*|streams|level|level_name|severity|log\.level)$|(^|[_.-])(id|uuid|hash|token)$|time(stamp)?$|_at$/i;

export interface Impact {
  sampled: number;
  /** How many distinct users, orders, requests… the lines name, by the correlation fields. */
  affected: { label: string; count: number }[];
  /** The fields its lines carry, with their commonest values and their share of the lines. */
  tags: { field: string; values: { value: string; share: number }[] }[];
}

/** Who an error hits and where, from a sample of its lines. */
export function impactOf(rows: Record<string, unknown>[], field: string): Impact {
  const affected = NAMES.map((name, i) => {
    const seen = new Set<string>();
    for (const row of rows) for (const [k, v] of Object.entries(row)) if (name.test(leaf(k)) && identifying(v)) seen.add(String(v));
    return { label: NAME_LABELS[i], count: seen.size };
  }).filter((a) => a.count > 0);
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (k === field || SILENT.test(k) || NAMES.some((n) => n.test(leaf(k))) || v == null || v === "" || typeof v === "object") continue;
      const text = String(v);
      if (text.length > 120) continue;
      const values = counts.get(k) ?? new Map<string, number>();
      values.set(text, (values.get(text) ?? 0) + 1);
      counts.set(k, values);
    }
  }
  const rank = (f: string) => {
    const i = TELLING.findIndex((t) => t.test(f));
    return i < 0 ? TELLING.length : i;
  };
  const tags = [...counts]
    .map(([f, values]) => ({ field: f, carried: [...values.values()].reduce((a, b) => a + b, 0), values }))
    .filter((t) => t.carried >= rows.length * 0.3 && t.values.size <= 40)
    .sort((a, b) => rank(a.field) - rank(b.field) || b.carried - a.carried || a.field.localeCompare(b.field))
    .slice(0, 6)
    .map((t) => ({
      field: t.field,
      values: [...t.values]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([value, n]) => ({ value, share: n / rows.length })),
    }));
  return { sampled: rows.length, affected, tags };
}

/** The version its lines name, the commonest of them: what an error was first seen in. */
export function versionOf(rows: Record<string, unknown>[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const k = Object.keys(row).find((f) => TELLING[2].test(f) && row[f] != null && row[f] !== "");
    if (k) counts.set(String(row[k]), (counts.get(String(row[k])) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

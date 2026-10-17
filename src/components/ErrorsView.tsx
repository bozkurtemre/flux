// Errors: each project's errors on one screen, in the place of the explorer as the Monitor is.
// A list, filtered by project and by what needs looking at, each error with its last day hour by
// hour, and the error picked beside it: who it hits, the version it came in, the merge it came
// after, its latest lines, and what can be done about it, Claude included. The looks that fill
// the list run in the store, five minutes apart (lib/errors); picking an error is the only time
// this screen asks the source anything.
import { useEffect, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  BellOff,
  BellRing,
  CheckCheck,
  CircleCheck,
  ClipboardCopy,
  FileSearch,
  GitPullRequest,
  RefreshCw,
  RotateCcw,
  Search,
  SearchCheck,
  SquarePen,
  SquareTerminal,
} from "lucide-react";
import * as cache from "@/lib/cache";
import { ago } from "@/lib/island";
import { errorQuery, impactOf, listed, muted, rateOf, versionOf, type Impact, type KnownError } from "@/lib/errors";
import { promptOf, reportOf } from "@/lib/investigate";
import type { Bucket } from "@/lib/datasource";
import { failureReason } from "@/lib/progress";
import { clientFor, useApp } from "@/store";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { Select } from "./settings/controls";
import { formatTs } from "./ResultGrid";
import { ClaudeIcon } from "./icons";
import { sendToClaude } from "./TerminalPanel";

type Row = Record<string, unknown>;
type Status = "new" | "open" | "ignored" | "resolved" | "all";
interface Entry {
  projectId: string;
  project: string;
  error: KnownError;
}

const STATUSES: { value: Status; label: string }[] = [
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "ignored", label: "Ignored" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];
const holds = (s: Status, e: KnownError, now: number) =>
  s === "all" ||
  (s === "new"
    ? !!e.news
    : s === "resolved"
      ? e.resolvedAt != null
      : s === "ignored"
        ? e.resolvedAt == null && muted(e, now)
        : e.resolvedAt == null && !muted(e, now));
const COLUMNS = "grid grid-cols-[70px_minmax(0,1fr)_96px_120px_60px_70px_70px] items-center gap-3";
const HOUR = 3_600_000;
const HOT = "#f0883e";

/** An error's last 24 hours, one count an hour, oldest first. */
function lastDay(e: KnownError, now: number): number[] {
  const hours = new Map(e.hours ?? []);
  const start = Math.floor(now / HOUR) * HOUR - 23 * HOUR;
  return Array.from({ length: 24 }, (_, i) => hours.get(start + i * HOUR) ?? 0);
}

/** How many times its usual rate the last hour ran, when that is worth saying. */
function heat(e: KnownError, now: number): number | null {
  const rate = rateOf(e, now);
  if (!rate) return null;
  const times = rate.lastHour / Math.max(rate.usual, 1);
  return times >= 2 ? times : null;
}

export function ErrorsView() {
  const { settings, errorLedgers, errorFocus, focusError, seeErrors, checkErrors } = useApp();
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState<Status>("open");
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; entry: Entry } | null>(null);
  const [looking, setLooking] = useState(false);
  // the "ago"s and the snoozes move on while the screen is open
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const projects = settings.projects.filter((p) => p.streams.length);
  const scope = projects.filter((p) => !projectId || p.id === projectId);
  const entries: Entry[] = scope.flatMap((p) =>
    Object.values(errorLedgers[p.id]?.errors ?? {}).map((error) => ({ projectId: p.id, project: p.name, error })),
  );
  const needle = filter.trim().toLowerCase();
  const found = entries.filter((e) => !needle || e.error.template.toLowerCase().includes(needle) || e.error.sample.toLowerCase().includes(needle));
  const order = new Map(listed(found.map((e) => e.error)).map((e, i) => [e, i]));
  const shown = found.filter((e) => holds(status, e.error, now)).sort((a, b) => order.get(a.error)! - order.get(b.error)!);
  const count = (s: Status) => found.filter((e) => holds(s, e.error, now)).length;
  const lastLook = Math.max(0, ...scope.map((p) => errorLedgers[p.id]?.checkedTo ?? 0));
  const selected = errorFocus && entries.find((e) => e.projectId === errorFocus.projectId && e.error.template === errorFocus.template);
  const look = () => {
    setLooking(true);
    void checkErrors().finally(() => setLooking(false));
  };

  if (settings.advanced.newErrors === false || !projects.length) {
    return (
      <div className="island flex h-full items-center justify-center px-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
        {settings.advanced.newErrors === false
          ? "Looking for errors is off. Settings › Advanced › New errors turns it back on."
          : "Group streams into a project in Settings › Projects, and its errors are counted here: the ones it never had before on top."}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-1.5 overflow-hidden">
      <div className="island-editor flex h-10 shrink-0 items-center gap-2 px-3">
        <span className="text-[13px] font-semibold">Errors</span>
        <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {lastLook ? `looked ${ago(now - lastLook)} ago` : "first look in a moment"} · every 5 minutes
        </span>
        <button
          onClick={look}
          disabled={looking}
          data-tip="Look now"
          className="flex size-[26px] items-center justify-center rounded hover:bg-[var(--bg-hover)] disabled:opacity-50"
          style={{ color: "var(--text-dim)" }}
        >
          <RefreshCw size={13} className={looking ? "animate-spin" : undefined} />
        </button>
        <span className="ml-auto flex items-center gap-2">
          <span className="flex h-[26px] w-[200px] items-center gap-1.5 rounded px-2" style={{ background: "var(--bg-input)" }}>
            <Search size={11} style={{ color: "var(--text-muted)" }} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              spellCheck={false}
              className="selectable h-full w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
            />
          </span>
          {projects.length > 1 && (
            <Select
              value={projectId}
              width={180}
              onChange={setProjectId}
              options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
            />
          )}
          <span className="flex rounded-[5px] p-px" style={{ background: "var(--bg-input)" }}>
            {STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                className="flex h-[22px] items-center gap-1.5 rounded-[4px] px-2 text-[11.5px]"
                style={{
                  background: s.value === status ? "var(--bg-active)" : undefined,
                  color: s.value === status ? "var(--text)" : "var(--text-dim)",
                }}
              >
                {s.label}
                <span className="tabular-nums" style={{ color: s.value === "new" && count("new") ? "var(--red)" : "var(--text-muted)" }}>
                  {count(s.value)}
                </span>
              </button>
            ))}
          </span>
          {count("new") > 0 && (
            <button
              onClick={seeErrors}
              data-tip="Mark all as seen"
              className="flex size-[26px] items-center justify-center rounded hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-dim)" }}
            >
              <CheckCheck size={13} />
            </button>
          )}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 gap-1.5">
        <Veil />
        <div className="island-editor flex min-w-0 flex-1 flex-col overflow-hidden">
          <div
            className={`${COLUMNS} h-[30px] shrink-0 px-3 text-[11px] font-medium`}
            style={{ color: "var(--text-dim)", borderBottom: "1px solid var(--border-soft)" }}
          >
            <span />
            <span>Error</span>
            <span>Last 24 hours</span>
            <span>Project</span>
            <span className="text-right">Events</span>
            <span className="text-right">First seen</span>
            <span className="text-right">Last seen</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {!shown.length ? (
              <p className="p-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
                {!lastLook
                  ? "Reading the last day of each project's failures: what it already has stays quiet, and what it never had shows up here."
                  : needle
                    ? `Nothing matches “${filter.trim()}”.`
                    : status === "new"
                      ? "Nothing new: every error here has been looked at."
                      : status === "resolved"
                        ? "Nothing resolved. Right-click an error to resolve it, and it is announced again if it comes back."
                        : status === "ignored"
                          ? "Nothing snoozed or ignored. Right-click a noisy error to keep it quiet for a while, or until it escalates."
                          : "No errors in the day before the first look, nor since."}
              </p>
            ) : (
              shown.map((entry) => {
                const e = entry.error;
                const on = selected?.projectId === entry.projectId && selected.error.template === e.template;
                const hot = heat(e, now);
                return (
                  <div
                    key={`${entry.projectId}|${e.template}`}
                    onClick={() => focusError({ projectId: entry.projectId, template: e.template })}
                    onDoubleClick={() => useApp.getState().openError(entry.projectId, e.template)}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      // the menu is about the error it was opened on, so that is the one shown beside it
                      focusError({ projectId: entry.projectId, template: e.template });
                      setMenu({ x: ev.clientX, y: ev.clientY, entry });
                    }}
                    className={`${COLUMNS} cursor-default px-3 py-2 hover:bg-[var(--bg-hover)]`}
                    style={{
                      background: on ? "var(--bg-active)" : menu?.entry === entry ? "var(--bg-hover)" : undefined,
                      borderBottom: "1px solid var(--border-soft)",
                      opacity: e.resolvedAt != null || muted(e, now) ? 0.6 : undefined,
                    }}
                  >
                    <StatusChip error={e} now={now} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-[var(--font-mono)] text-[12px]" style={{ color: "var(--text)" }} title={e.template}>
                        {e.template}
                      </span>
                      <span className="flex min-w-0 items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        <span className="truncate font-[var(--font-mono)]" title={e.sample}>
                          {e.sample}
                        </span>
                        {e.deploy && (
                          <span className="flex shrink-0 items-center gap-1" style={{ color: "var(--cyan)" }} title={e.deploy.label}>
                            <GitPullRequest size={10} /> after {e.deploy.label.split(" ")[0]}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Spark values={lastDay(e, now)} color={e.escalating ? HOT : "var(--red)"} />
                      {hot && (
                        <span className="shrink-0 text-[10.5px] font-medium tabular-nums" style={{ color: e.escalating ? HOT : "var(--text-dim)" }}>
                          ↑{Math.round(hot)}×
                        </span>
                      )}
                    </span>
                    <span className="truncate text-[12px]" style={{ color: "var(--text-dim)" }}>
                      {entry.project}
                    </span>
                    <span className="text-right text-[12px] tabular-nums">{e.count.toLocaleString()}</span>
                    <span className="text-right text-[11.5px] tabular-nums" style={{ color: "var(--text-dim)" }}>
                      {ago(now - e.firstSeen)} ago
                    </span>
                    <span className="text-right text-[11.5px] tabular-nums" style={{ color: "var(--text-dim)" }}>
                      {ago(now - e.lastSeen)} ago
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="island-editor flex w-[40%] max-w-[600px] min-w-[360px] flex-col overflow-hidden">
          {selected ? (
            <Detail key={`${selected.projectId}|${selected.error.template}`} entry={selected} now={now} />
          ) : (
            <p className="m-auto px-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
              Pick an error for who it hits, the version and the merge it came with, its last day and its latest lines. Double-click opens its lines
              in a console.
            </p>
          )}
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={actionsFor(menu.entry, now)} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** Every field an error's streams carry, from the tree's cache, or asked of the source once. */
async function fieldsOf(connId: string, streams: string[]): Promise<string[]> {
  const conn = useApp.getState().settings.connections.find((c) => c.id === connId);
  if (!conn) return [];
  const cached = await cache.load(connId);
  const names = new Set<string>(["timestamp"]);
  for (const s of streams) {
    const fields =
      cached.byStream[s]?.fields ??
      (await clientFor(conn)
        .fields(s)
        .catch(() => []));
    fields.forEach((f) => names.add(f.name));
  }
  return [...names];
}

/** An error's newest line, every field of it, for Investigate to start from. */
async function newestLine({ projectId, error }: Entry): Promise<Row | null> {
  const { settings, errorLedgers } = useApp.getState();
  const project = settings.projects.find((p) => p.id === projectId);
  const conn = settings.connections.find((c) => c.id === project?.connectionId);
  const ledger = errorLedgers[projectId];
  if (!project || !conn || !ledger) return null;
  const page = await clientFor(conn).messages({
    query: errorQuery(ledger, error.template),
    streams: project.streams,
    timerange: { type: "relative", range: 7 * 86_400 },
    fields: await fieldsOf(conn.id, project.streams),
    size: 1,
  });
  return page.rows[0] ?? null;
}

/** Investigate on the error's newest line: the case, gathered in its window. */
async function investigate(entry: Entry, row?: Row | null): Promise<void> {
  const line = row ?? (await newestLine(entry).catch(() => null));
  if (!line) return useApp.getState().notify("warning", "Nothing to investigate", "None of its lines is within the last week.");
  await useApp.getState().investigateError(entry.projectId, entry.error.template, line);
}

/** The case, once it is gathered, pasted into the terminal where Claude Code runs. */
async function askClaude(entry: Entry, row?: Row | null): Promise<void> {
  await investigate(entry, row);
  const inv = useApp.getState().investigation;
  if (!inv || inv.pending.length) return;
  await sendToClaude(promptOf(reportOf(inv.evidence), inv.evidence.subject.message));
  useApp.setState({ investigation: null });
}

/** What can be done about an error, in its menu and under its details. */
function actionsFor(entry: Entry, now: number, row?: Row | null): MenuItem[] {
  const app = useApp.getState();
  const { projectId, error } = entry;
  // asked of the console the error opens in, which is where its project is known
  const inConsole = (then: (tabId: string) => void) => {
    app.openError(projectId, error.template);
    const tabId = useApp.getState().activeTab;
    if (tabId) then(tabId);
  };
  const quiet = muted(error, now);
  return [
    { label: "Investigate", icon: <SearchCheck size={12} />, onClick: () => void investigate(entry, row) },
    { label: "Ask Claude to fix", icon: <ClaudeIcon size={12} />, onClick: () => void askClaude(entry, row) },
    { label: "Open in a console", icon: <SquareTerminal size={12} />, onClick: () => app.openError(projectId, error.template) },
    {
      label: "Where is this logged?",
      icon: <FileSearch size={12} />,
      onClick: () => inConsole((tabId) => void useApp.getState().whereLogged(tabId, error.template)),
    },
    {
      label: "Create Jira issue",
      icon: <SquarePen size={12} />,
      onClick: () =>
        inConsole((tabId) => useApp.getState().issueFromPattern(tabId, { template: error.template, count: error.count, sample: error.sample })),
    },
    { separator: true },
    { label: "Copy pattern", icon: <ClipboardCopy size={12} />, onClick: () => void navigator.clipboard.writeText(error.template) },
    { label: "Copy a sample", icon: <ClipboardCopy size={12} />, onClick: () => void navigator.clipboard.writeText(error.sample) },
    { separator: true },
    ...(quiet
      ? [
          {
            label: error.ignored ? "Stop ignoring" : "Unsnooze",
            icon: <BellRing size={12} />,
            onClick: () => app.muteError(projectId, error.template, null),
          },
        ]
      : [
          { label: "Snooze for an hour", icon: <BellOff size={12} />, onClick: () => app.muteError(projectId, error.template, "hour") },
          { label: "Snooze for a day", icon: <BellOff size={12} />, onClick: () => app.muteError(projectId, error.template, "day") },
          { label: "Ignore unless it escalates", icon: <BellOff size={12} />, onClick: () => app.muteError(projectId, error.template, "ignore") },
        ]),
    error.resolvedAt != null
      ? { label: "Reopen", icon: <RotateCcw size={12} />, onClick: () => app.resolveError(projectId, error.template, false) }
      : { label: "Resolve", icon: <CircleCheck size={12} />, onClick: () => app.resolveError(projectId, error.template, true) },
  ];
}

function StatusChip({ error, now }: { error: KnownError; now: number }) {
  const [label, color] =
    error.news === "new"
      ? ["new", "var(--red)"]
      : error.news === "back"
        ? ["back", "var(--amber)"]
        : error.news === "escalating" || error.escalating
          ? ["escalating", HOT]
          : error.resolvedAt != null
            ? ["resolved", "var(--green)"]
            : error.ignored
              ? ["ignored", "var(--text-muted)"]
              : muted(error, now)
                ? ["snoozed", "var(--text-muted)"]
                : ["open", "var(--text-muted)"];
  return (
    <span
      className="justify-self-start rounded px-1.5 py-px text-[9.5px] font-semibold tracking-wide uppercase"
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      {label}
    </span>
  );
}

/** A day of hourly counts as bars, as wide as its column. */
function Spark({ values, color }: { values: number[]; color: string }) {
  const top = Math.max(1, ...values);
  return (
    <span className="flex h-[18px] w-[64px] shrink-0 items-end gap-px">
      {values.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-[1px]"
          style={{ height: `${v ? Math.max(12, (v / top) * 100) : 6}%`, background: v ? color : "var(--border)" }}
        />
      ))}
    </span>
  );
}

interface Read {
  hours: Bucket[];
  lines: Row[];
  impact: Impact;
  version: string | null;
}

/** One error in full: what it is, who it hits, when, after what, its day and its latest lines. */
function Detail({ entry, now }: { entry: Entry; now: number }) {
  const { settings, errorLedgers } = useApp();
  const project = settings.projects.find((p) => p.id === entry.projectId);
  const conn = settings.connections.find((c) => c.id === project?.connectionId);
  const ledger = errorLedgers[entry.projectId];
  const e = entry.error;
  const zone = settings.results.timezone;
  const [read, setRead] = useState<Read | { error: string } | null>(null);

  // read once per error picked, the view being keyed by it: its day, a sample of its lines for
  // who it hits, and the lines it was first seen with for the version it came in
  useEffect(() => {
    if (!project || !conn || !ledger) return;
    const abort = new AbortController();
    const client = clientFor(conn);
    const query = errorQuery(ledger, e.template);
    const day = { type: "relative" as const, range: 24 * 3600 };
    const first = { type: "absolute" as const, from: new Date(e.firstSeen - 60_000).toISOString(), to: new Date(e.firstSeen + HOUR).toISOString() };
    const gather = async (): Promise<Read> => {
      const fields = await fieldsOf(conn.id, project.streams);
      const [hours, sample, earliest] = await Promise.all([
        client.histogram({ query, streams: project.streams, timerange: day, interval: "1h", signal: abort.signal }),
        client.messages({ query, streams: project.streams, timerange: day, fields, size: 200, signal: abort.signal }),
        client.messages({ query, streams: project.streams, timerange: first, fields, size: 20, sortOrder: "asc", signal: abort.signal }),
      ]);
      return { hours, lines: sample.rows, impact: impactOf(sample.rows, ledger.field), version: versionOf(earliest.rows) };
    };
    gather().then(setRead, (err: unknown) => !abort.signal.aborted && setRead({ error: failureReason(err) }));
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const got = read && "lines" in read ? read : null;
  // the last 24 hours, one bar each, as the source counts them, whatever it left out
  const start = Math.floor((now - 23 * HOUR) / HOUR) * HOUR;
  const byHour = new Map(got ? got.hours.map((b) => [Math.floor(new Date(b.at).getTime() / HOUR) * HOUR, b.count]) : []);
  const hours = Array.from({ length: 24 }, (_, i) => ({ at: start + i * HOUR, count: byHour.get(start + i * HOUR) ?? 0 }));
  const top = Math.max(1, ...hours.map((h) => h.count));
  const rate = rateOf(e, now);
  const shimmer = (widths: number[], h = 10) => (
    <div className="flex flex-col gap-2" role="status" aria-label="Reading">
      {widths.map((w) => (
        <span key={w} className="flux-shimmer block" style={{ width: `${w}%`, height: h }} />
      ))}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <div className="flex items-center gap-2">
        <StatusChip error={e} now={now} />
        <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {entry.project}
        </span>
      </div>
      <p className="selectable mt-2 font-[var(--font-mono)] text-[13px] leading-snug break-words" style={{ color: "var(--text)" }}>
        {e.template}
      </p>
      <p className="selectable mt-1.5 font-[var(--font-mono)] text-[11.5px] leading-snug break-words" style={{ color: "var(--text-dim)" }}>
        {e.sample}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => void askClaude(entry, got?.lines[0])}
          className="flex h-[26px] items-center gap-1.5 rounded-[4px] px-2.5 text-[12px] font-medium"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          data-tip="Investigates its newest line, then pastes the case into the terminal where Claude Code runs"
        >
          <ClaudeIcon size={12} /> Ask Claude to fix
        </button>
        {actionsFor(entry, now, got?.lines[0])
          .filter((a) => a.label && !["Ask Claude to fix", "Copy a sample", "Snooze for a day", "Copy pattern"].includes(a.label))
          .map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className="flex h-[26px] items-center gap-1.5 rounded-[4px] px-2.5 text-[12px] hover:bg-[var(--bg-hover)]"
              style={{ border: "1px solid var(--border)", color: "var(--text)" }}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
      </div>

      <div className="mt-4 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12px]">
        <Fact label="Events">{e.count.toLocaleString()} seen since Flux first looked</Fact>
        {rate && (
          <Fact label="Rate">
            <span style={{ color: e.escalating ? HOT : undefined }}>
              {Math.round(rate.lastHour).toLocaleString()} in the last hour, against {rate.usual < 1 ? rate.usual.toFixed(1) : Math.round(rate.usual)}{" "}
              an hour usually
            </span>
          </Fact>
        )}
        <Fact label="First seen">
          {formatTs(new Date(e.firstSeen), zone, "short")} · {ago(now - e.firstSeen)} ago
          {got?.version && <span style={{ color: "var(--text-muted)" }}>in version {got.version}</span>}
        </Fact>
        <Fact label="Last seen">
          {formatTs(new Date(e.lastSeen), zone, "short")} · {ago(now - e.lastSeen)} ago
        </Fact>
        {e.resolvedAt != null && <Fact label="Resolved">{formatTs(new Date(e.resolvedAt), zone, "short")}</Fact>}
        {e.ignored && <Fact label="Ignored">announced again only if it escalates</Fact>}
        {!e.ignored && (e.snoozedUntil ?? 0) > now && <Fact label="Snoozed">until {formatTs(new Date(e.snoozedUntil!), zone, "short")}</Fact>}
        {e.deploy && (
          <Fact label="After">
            <button
              onClick={() => void openUrl(e.deploy!.url)}
              className="flex min-w-0 items-center gap-1 text-left hover:underline"
              style={{ color: "var(--accent)" }}
            >
              <GitPullRequest size={11} className="shrink-0" />
              <span className="truncate">{e.deploy.label}</span>
            </button>
            <span style={{ color: "var(--text-muted)" }}>merged {ago(e.firstSeen - new Date(e.deploy.at).getTime())} before it was first seen</span>
          </Fact>
        )}
      </div>

      <Section title="Who it hits" note={got ? `in its last ${got.impact.sampled.toLocaleString()} lines` : undefined}>
        {!read ? (
          shimmer([60, 90, 75, 85])
        ) : !got ? (
          <Muted>{"error" in read ? read.error : ""}</Muted>
        ) : !got.impact.affected.length && !got.impact.tags.length ? (
          <Muted>Its lines carry nothing to tell them apart by.</Muted>
        ) : (
          <>
            {got.impact.affected.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {got.impact.affected.map((a) => (
                  <span key={a.label} className="rounded-[4px] px-2 py-0.5 text-[12px] tabular-nums" style={{ background: "var(--bg-input)" }}>
                    <b>{a.count.toLocaleString()}</b> {a.count === 1 ? a.label : `${a.label}s`}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {got.impact.tags.map((t) => (
                <div key={t.field} className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-3 text-[12px]">
                  <span className="truncate font-[var(--font-mono)] text-[11.5px]" style={{ color: "var(--text-muted)" }} title={t.field}>
                    {t.field}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    {t.values.map((v) => (
                      <span key={v.value} className="flex items-center gap-2">
                        <span className="relative h-[16px] min-w-0 flex-1 overflow-hidden rounded-[3px]" style={{ background: "var(--bg-input)" }}>
                          <span
                            className="absolute inset-y-0 left-0"
                            style={{ width: `${v.share * 100}%`, background: "color-mix(in srgb, var(--accent) 35%, transparent)" }}
                          />
                          <span className="relative block truncate px-1.5 font-[var(--font-mono)] text-[11px] leading-[16px]" title={v.value}>
                            {v.value}
                          </span>
                        </span>
                        <span className="w-[34px] shrink-0 text-right text-[11px] tabular-nums" style={{ color: "var(--text-dim)" }}>
                          {Math.round(v.share * 100)}%
                        </span>
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title="Last 24 hours" note={got ? `${got.hours.reduce((n, b) => n + b.count, 0).toLocaleString()} lines` : undefined}>
        {read && !got ? null : (
          <div className="flex h-[64px] items-end gap-px">
            {hours.map((h) => (
              <div
                key={h.at}
                data-tip={`${formatTs(new Date(h.at), zone, "short")} · ${h.count.toLocaleString()}`}
                className={`flex-1 rounded-t-[2px] ${got ? "" : "flux-shimmer"}`}
                style={{
                  height: got ? `${Math.max(h.count ? 6 : 2, (h.count / top) * 100)}%` : "60%",
                  background: got ? (h.count ? "var(--red)" : "var(--border)") : undefined,
                }}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Latest lines" note="the newest 20 in the last day">
        {!read ? (
          shimmer([92, 78, 85, 70, 88])
        ) : !got ? null : !got.lines.length ? (
          <Muted>None in the last day.</Muted>
        ) : (
          <div className="flex flex-col">
            {got.lines.slice(0, 20).map((row, i) => (
              <div key={i} className="flex gap-3 py-[3px] text-[11.5px]" style={{ borderBottom: "1px solid var(--border-soft)" }}>
                <span className="shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {formatTs(new Date(String(row.timestamp)), zone, "time")}
                </span>
                <span className="selectable min-w-0 truncate font-[var(--font-mono)]" title={String(row[ledger?.field ?? "message"] ?? "")}>
                  {String(row[ledger?.field ?? "message"] ?? "")}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/** Coming in, the list and the detail shimmer a moment and give way to what is there, as the
 *  explorer does on its way back from here (Veil.tsx) and the Monitor while it reads. */
function Veil() {
  const bar = (w: string, h: number) => <span className="flux-shimmer block" style={{ width: w, height: h }} />;
  return (
    <div className="flux-veil pointer-events-none absolute inset-0 z-20 flex gap-1.5" aria-hidden>
      <div className="island-editor flex min-w-0 flex-1 flex-col gap-3 p-3">
        {bar("100%", 14)}
        {[86, 72, 90, 64, 80, 58, 76].map((w) => (
          <span key={w} className="flex items-center gap-3">
            {bar("40px", 12)}
            {bar(`${w}%`, 12)}
          </span>
        ))}
      </div>
      <div className="island-editor flex w-[40%] max-w-[600px] min-w-[360px] flex-col gap-2.5 p-4">
        {bar("30%", 10)}
        {bar("90%", 16)}
        {bar("70%", 10)}
        {bar("100%", 64)}
        {[88, 74, 82].map((w) => (
          <span key={w}>{bar(`${w}%`, 10)}</span>
        ))}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="flex min-w-0 flex-col">{children}</span>
    </>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[12px] font-semibold">{title}</span>
        {note && (
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {note}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

const Muted = ({ children }: { children: ReactNode }) => (
  <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
    {children}
  </p>
);

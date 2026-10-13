import { useContext, useEffect, useState } from "react";
import { Check, Lock, Trash2 } from "lucide-react";
import { SourceIcon } from "../icons";
import { Button, Checkbox, Indexing, Num, Row, Section, Select, Swatches, Text } from "./controls";
import { QUICK_RANGES, SOURCE_KINDS, type SourceKind } from "@/lib/datasource";
import { connectionsFromEnv, newConnection, newProject, SHORTCUTS, type Connection, type Settings, type TerminalSettings } from "@/lib/settings";
import * as cache from "@/lib/cache";
import { clientFor, useApp } from "@/store";
import { failureReason } from "@/lib/progress";
import { shortPath, workspaceName } from "@/lib/workspaces";
import { clientConfig } from "@/lib/mcp";
import { SOUNDS } from "@/lib/queries";
import { announce } from "@/lib/notify";
import { invoke } from "@tauri-apps/api/core";
import { open as openFolder, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { bundleName, makeBundle, mergeBundle, readBundle } from "@/lib/bundle";
import { IDES } from "@/lib/source";
import { ConfirmDialog } from "../ContextMenu";
import { accountOf, deleteCloudData, pushPreferences, signOut, type Account } from "@/lib/cloud";

export type Patch = (p: (s: Settings) => Settings) => void;

/** The short name a kind goes by in the connection list. */
const KIND_NAME: Record<SourceKind, string> = { graylog: "Graylog", kibana: "Kibana", local: "Local" };

export function AppearancePage({ s, patch }: { s: Settings; patch: Patch }) {
  const a = s.appearance;
  const set = <K extends keyof typeof a>(k: K, v: (typeof a)[K]) => patch((x) => ({ ...x, appearance: { ...x.appearance, [k]: v } }));
  return (
    <>
      <Section title="Theme">
        <Row label="Theme">
          <Select
            value={a.theme}
            onChange={(v) => set("theme", v)}
            options={[
              { value: "dark", label: "Islands Dark" },
              { value: "light", label: "Islands Light" },
              { value: "system", label: "Sync with OS" },
            ]}
          />
        </Row>
        <Row label="Accent colour">
          <Swatches value={a.accent} onChange={(v) => set("accent", v)} />
        </Row>
      </Section>
      <Section title="Island">
        <Row>
          <Checkbox
            checked={a.island}
            onChange={(v) => set("island", v)}
            label="Show the island over the title bar"
            hint="What is running, being followed or being watched, in one place. It stays out of the way when nothing is."
          />
        </Row>
      </Section>
      <Section title="Status Bar">
        <Row>
          <Checkbox
            checked={a.usage !== false}
            onChange={(v) => set("usage", v)}
            label="Show Flux's CPU and memory use"
            hint="What Flux itself takes, its webview and terminals with it, as shares of this Mac. Read every two seconds."
          />
        </Row>
      </Section>
      <Section title="Interface">
        <Row label="UI font size" hint="Applies to the chrome: tree, tabs, dialogs. Editors and grids have their own size.">
          <Num value={a.uiFontSize} onChange={(v) => set("uiFontSize", v)} min={10} max={20} suffix="px" />
        </Row>
        <Row label="Density" hint="Scales row heights and padding throughout the window.">
          <Select
            value={a.density}
            onChange={(v) => set("density", v)}
            options={[
              { value: "compact", label: "Compact" },
              { value: "default", label: "Default" },
              { value: "comfortable", label: "Comfortable" },
            ]}
          />
        </Row>
      </Section>
    </>
  );
}

export function TreePage({ s, patch }: { s: Settings; patch: Patch }) {
  const t = s.tree;
  const set = <K extends keyof typeof t>(k: K, v: (typeof t)[K]) => patch((x) => ({ ...x, tree: { ...x.tree, [k]: v } }));
  return (
    <>
      <Section title="Rows">
        <Row label="Row height">
          <Num value={t.rowHeight} onChange={(v) => set("rowHeight", v)} min={18} max={40} suffix="px" />
        </Row>
        <Row label="Indent per level">
          <Num value={t.indent} onChange={(v) => set("indent", v)} min={8} max={32} suffix="px" />
        </Row>
      </Section>
      <Section title="Endpoint rows">
        <Row>
          <Checkbox checked={t.showCounts} onChange={(v) => set("showCounts", v)} label="Show request counts" />
        </Row>
        <Row>
          <Checkbox checked={t.showErrorRate} onChange={(v) => set("showErrorRate", v)} label="Show error rate when above 1%" />
        </Row>
        <Row>
          <Checkbox
            checked={t.colorByHealth}
            onChange={(v) => set("colorByHealth", v)}
            label="Colour the icon by error rate"
            hint="Amber above 1%, red above 5%."
          />
        </Row>
        <Row label="Sort by">
          <Select
            value={t.sortEndpointsBy}
            onChange={(v) => set("sortEndpointsBy", v)}
            options={[
              { value: "traffic", label: "Requests, busiest first" },
              { value: "errors", label: "Error rate, worst first" },
              { value: "name", label: "Path, alphabetical" },
            ]}
          />
        </Row>
      </Section>
      <Section title="Loading">
        <Row label="Endpoints per stream" hint="An upper bound on how many endpoints one stream contributes to the tree.">
          <Num value={t.endpointLimit} onChange={(v) => set("endpointLimit", v)} min={50} max={5000} step={50} width={110} />
        </Row>
        <Row
          label="Look back"
          hint="The window that decides which endpoints exist and how busy they are. Cost grows with it: roughly a second at 1 hour, four at 6, ten at 24 on a busy stream. The result is cached, so only the first open and Refresh pay it."
        >
          <Num value={t.lookbackHours} onChange={(v) => set("lookbackHours", v)} min={1} max={720} suffix="hours" />
        </Row>
      </Section>
    </>
  );
}

export function EditorPage({ s, patch }: { s: Settings; patch: Patch }) {
  const e = s.editor;
  const set = <K extends keyof typeof e>(k: K, v: (typeof e)[K]) => patch((x) => ({ ...x, editor: { ...x.editor, [k]: v } }));
  return (
    <>
      <Section title="Appearance">
        <Row label="Font size">
          <Num value={e.fontSize} onChange={(v) => set("fontSize", v)} min={9} max={24} suffix="px" />
        </Row>
        <Row>
          <Checkbox checked={e.lineNumbers} onChange={(v) => set("lineNumbers", v)} label="Show line numbers" />
        </Row>
        <Row>
          <Checkbox checked={e.wrap} onChange={(v) => set("wrap", v)} label="Soft-wrap long queries" />
        </Row>
        <Row>
          <Checkbox checked={e.highlightActiveLine} onChange={(v) => set("highlightActiveLine", v)} label="Highlight the caret line" />
        </Row>
      </Section>
      <Section title="Behaviour">
        <Row>
          <Checkbox
            checked={e.autocomplete}
            onChange={(v) => set("autocomplete", v)}
            label="Complete field names while typing"
            hint="Names come from the stream's own fields. Ctrl+Space always works."
          />
        </Row>
        <Row>
          <Checkbox checked={e.runOnOpen} onChange={(v) => set("runOnOpen", v)} label="Run the query when a tab opens" />
        </Row>
      </Section>
    </>
  );
}

export function ResultsPage({ s, patch }: { s: Settings; patch: Patch }) {
  const r = s.results;
  const set = <K extends keyof typeof r>(k: K, v: (typeof r)[K]) => patch((x) => ({ ...x, results: { ...x.results, [k]: v } }));
  return (
    <>
      <Section title="Query">
        <Row label="Default time range">
          <Select
            value={r.defaultRangeSeconds}
            onChange={(v) => set("defaultRangeSeconds", Number(v))}
            options={QUICK_RANGES.map((q) => ({ value: q.seconds, label: `Last ${q.label}` }))}
          />
        </Row>
        <Row label="Rows per query" hint="The source is asked for this many messages. Above 10,000 the index refuses the request.">
          <Num value={r.pageSize} onChange={(v) => set("pageSize", v)} min={50} max={10000} step={50} width={110} />
        </Row>
        <Row>
          <Checkbox
            checked={r.timeline}
            onChange={(v) => set("timeline", v)}
            label="Show the timeline over the results"
            hint="Messages per bucket across the range, which you can drag across to narrow it. Two more requests per query."
          />
        </Row>
        <Row>
          <Checkbox
            checked={r.journey}
            onChange={(v) => set("journey", v)}
            label="Show the lanes over a traced id"
            hint="When a search follows one id across streams, which stream said what and when, above the rows."
          />
        </Row>
        <Row>
          <Checkbox
            checked={r.deployMarkers}
            onChange={(v) => set("deployMarkers", v)}
            label="Mark merged pull requests on the timeline"
            hint="For a project with a GitHub repository, through the gh CLI signed in on this machine. Flux keeps no GitHub token."
          />
        </Row>
        <Row>
          <Checkbox
            checked={r.jsonTree}
            onChange={(v) => set("jsonTree", v)}
            label="Fold nested JSON in the value inspector"
            hint="A chevron beside anything that opens a block, so a long message can be read a level at a time."
          />
        </Row>
        <Row label="Auto-refresh" hint="0 turns it off. The active tab re-runs its query on this interval.">
          <Num value={r.autoRefreshSeconds} onChange={(v) => set("autoRefreshSeconds", v)} min={0} max={3600} suffix="seconds" />
        </Row>
      </Section>
      <Section title="Grid">
        <Row label="Font size">
          <Num value={r.fontSize} onChange={(v) => set("fontSize", v)} min={9} max={20} suffix="px" />
        </Row>
        <Row label="Row height">
          <Num value={r.rowHeight} onChange={(v) => set("rowHeight", v)} min={18} max={40} suffix="px" />
        </Row>
        <Row>
          <Checkbox checked={r.stripedRows} onChange={(v) => set("stripedRows", v)} label="Shade alternating rows" />
        </Row>
        <Row>
          <Checkbox
            checked={r.colorBySeverity}
            onChange={(v) => set("colorBySeverity", v)}
            label="Colour level and status cells"
            hint="Errors red, warnings amber, 2xx green."
          />
        </Row>
        <Row label="Empty value shown as">
          <Text value={r.nullText} onChange={(v) => set("nullText", v)} width={120} mono />
        </Row>
      </Section>
      <Section title="Timestamps">
        <Row label="Time zone">
          <Select
            value={r.timezone}
            onChange={(v) => set("timezone", v)}
            options={[
              { value: "local", label: `Local (${Intl.DateTimeFormat().resolvedOptions().timeZone})` },
              { value: "utc", label: "UTC" },
            ]}
          />
        </Row>
        <Row label="Format">
          <Select
            value={r.timestampFormat}
            onChange={(v) => set("timestampFormat", v)}
            options={[
              { value: "iso", label: "2026-09-16T12:34:56.789Z" },
              { value: "short", label: "2026-09-16 12:34:56" },
              { value: "time", label: "12:34:56.789" },
            ]}
          />
        </Row>
      </Section>
    </>
  );
}

/** When something happened, as a date and time in this Mac's own format. */
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

/** What follows the account to another Mac, by the settings page it is set on, and what never does. */
const SYNCED = [
  "Appearance",
  "Connection Explorer",
  "Query Console",
  "Results Grid",
  "Terminal",
  "Updates",
  "MCP Server",
  "Jira",
  "Advanced Settings",
];
const LOCAL = ["Connections and their tokens", "Projects", "Saved queries and history", "Replay stage addresses", "Keymap and workspace"];

export function AccountPage({ s }: { s: Settings }) {
  const indexing = useContext(Indexing);
  const [account, setAccount] = useState<Account | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const notify = useApp((x) => x.notify);

  const load = () => void accountOf().then(setAccount);
  useEffect(() => {
    if (!indexing) load();
  }, [indexing]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await pushPreferences(s);
      load();
    } catch (e) {
      notify("error", "Could not sync", failureReason(e));
    } finally {
      setSyncing(false);
    }
  };

  const list = (items: string[], color: string, Icon: typeof Check) => (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-2 text-[13px]">
          <Icon size={13} style={{ color }} className="shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <Section title="Profile">
        <div className="flex items-center gap-3 py-2">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-[18px] font-semibold uppercase"
            style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)", color: "var(--accent)" }}
          >
            {account?.email.charAt(0) || "?"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium">{account?.email ?? "Not signed in"}</span>
            <span className="block text-[12px]" style={{ color: "var(--text-muted)" }}>
              Signed in with an email link
            </span>
          </span>
        </div>
        <Row label="Member since">
          <span className="text-[13px]">{when(account?.createdAt ?? null)}</span>
        </Row>
        <Row label="Last signed in">
          <span className="text-[13px]">{when(account?.lastSignIn ?? null)}</span>
        </Row>
      </Section>

      <Section title="Sync">
        <Row label="Last synced" hint="Your preferences are sent a few seconds after you change one, and brought in whenever you sign in.">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13px]">{account?.syncedAt ? when(account.syncedAt) : "Not yet"}</span>
            <Button onClick={() => void syncNow()} disabled={syncing || !account}>
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          </span>
        </Row>
        <div className="grid grid-cols-1 gap-5 py-2 sm:grid-cols-2">
          <div>
            <p className="pb-2 text-[12px] font-medium" style={{ color: "var(--text-dim)" }}>
              Follows you to every Mac
            </p>
            {list(SYNCED, "var(--green)", Check)}
          </div>
          <div>
            <p className="pb-2 text-[12px] font-medium" style={{ color: "var(--text-dim)" }}>
              Never leaves this Mac
            </p>
            {list(LOCAL, "var(--text-muted)", Lock)}
          </div>
        </div>
      </Section>

      <Section title="Sign out and delete">
        <Row label="Sign out" hint="Flux closes to the sign-in screen. This Mac keeps its settings, connections and queries.">
          <Button onClick={() => setLeaving(true)}>Sign out…</Button>
        </Row>
        <Row
          label="Synced preferences"
          hint="Removes the copy kept with your account. This Mac keeps its own settings, and the next change you make is synced again."
        >
          <Button onClick={() => setForgetting(true)} disabled={!account?.syncedAt}>
            Delete synced preferences…
          </Button>
        </Row>
      </Section>

      {leaving && (
        <ConfirmDialog
          title="Sign out of Flux?"
          message="Flux returns to the sign-in screen. Nothing on this Mac is deleted."
          confirmLabel="Sign out"
          onConfirm={async () => {
            await signOut();
            // the door opens again, asking who is there
            location.reload();
          }}
          onCancel={() => setLeaving(false)}
        />
      )}
      {forgetting && (
        <ConfirmDialog
          title="Delete your synced preferences?"
          message="The copy kept with your account is removed. This Mac keeps its own settings, and the next change you make is synced again."
          onConfirm={() => {
            setForgetting(false);
            void deleteCloudData()
              .then(() => {
                notify("info", "Synced preferences deleted", "Nothing of yours is kept in the cloud now.");
                load();
              })
              .catch((e: unknown) => notify("error", "Could not delete them", failureReason(e)));
          }}
          onCancel={() => setForgetting(false)}
        />
      )}
    </>
  );
}

export function AdvancedPage({ s, patch, onReset }: { s: Settings; patch: Patch; onReset: () => void }) {
  const a = s.advanced;
  const set = <K extends keyof typeof a>(k: K, v: (typeof a)[K]) => patch((x) => ({ ...x, advanced: { ...x.advanced, [k]: v } }));
  const [cacheDir, setCacheDir] = useState("");
  const [cleared, setCleared] = useState<number | null>(null);

  useEffect(() => {
    cache
      .location()
      .then(setCacheDir)
      .catch(() => {});
  }, []);

  return (
    <>
      <Section title="Correlation fields">
        <Row
          label="Your own id fields"
          hint="What else ties one request's lines together in your logs, besides the trace, request, correlation, transaction, session, order and user ids Flux already knows. Separated by commas; used by Follow the request, Investigate and the service map."
        >
          <Text value={a.correlationFields} onChange={(v) => set("correlationFields", v)} placeholder="tenant_id, booking_ref" mono width={300} />
        </Row>
      </Section>
      <Section title="Caches">
        <Row
          label="Introspection cache"
          hint="Stream and endpoint lists, so the tree opens without waiting. Everything here is re-read from the source on demand, so deleting it is always safe."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={async () => {
                setCleared(await cache.clear());
              }}
            >
              Invalidate Caches
            </Button>
            {cleared !== null && (
              <span className="text-[12px]" style={{ color: "var(--green)" }}>
                {cleared} removed; expand a stream to rebuild
              </span>
            )}
          </div>
        </Row>
        {cacheDir && (
          <Row label="Location">
            <span className="selectable font-[var(--font-mono)] text-[11px] break-all" style={{ color: "var(--text-muted)" }}>
              {cacheDir}
            </span>
          </Row>
        )}
      </Section>
      <Section title="Watched queries">
        <Row label="Check every" hint="How often a watched query asks what has arrived since the last round. 0 stops the rounds.">
          <Num value={a.watchSeconds} onChange={(v) => set("watchSeconds", v)} min={0} max={3600} suffix="seconds" />
        </Row>
        <Row label="Alert sound" hint="What a warning or an error sounds like outside the window. A query reported as info is always silent.">
          <span className="flex items-center gap-2">
            <Select
              value={a.watchSound}
              onChange={(v) => set("watchSound", v)}
              options={[{ value: "none", label: "Silent" }, ...SOUNDS.map((s) => ({ value: s, label: s }))]}
            />
            {/* the first test is also where macOS is asked, which is the point of having one */}
            <Button
              onClick={() =>
                void announce("⚠️ Flux", "A watched query sounds like this.", a.watchSound).then((shown) => {
                  if (!shown) {
                    useApp
                      .getState()
                      .notify("warning", "Notifications are off", "macOS is not allowing them for Flux. System Settings › Notifications › Flux.");
                  }
                })
              }
            >
              Test
            </Button>
          </span>
        </Row>
      </Section>
      <Section title="Network">
        <Row label="Request timeout">
          <Num value={a.requestTimeoutSeconds} onChange={(v) => set("requestTimeoutSeconds", v)} min={5} max={600} suffix="seconds" />
        </Row>
        <Row label="Cache stream fields for" hint="Field lists back the autocomplete; they rarely change.">
          <Num value={a.fieldCacheMinutes} onChange={(v) => set("fieldCacheMinutes", v)} min={0} max={1440} suffix="minutes" />
        </Row>
      </Section>
      <Section title="Editor tabs">
        <Row>
          <Checkbox checked={a.confirmOnClose} onChange={(v) => set("confirmOnClose", v)} label="Ask before closing a tab with an edited query" />
        </Row>
      </Section>
      <Section title="Reset">
        <Row label="" hint="Connections are kept; every other setting returns to its default.">
          <Button onClick={onReset}>Restore Defaults</Button>
        </Row>
      </Section>
    </>
  );
}

export function KeymapPage() {
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  return (
    <>
      {groups.map((g) => (
        <Section key={g} title={g}>
          {SHORTCUTS.filter((s) => s.group === g).map((s) => (
            <div key={s.action} className="flex items-center gap-3 py-[3px]">
              <span className="w-[190px] shrink-0 text-right text-[13px]">{s.action}</span>
              <span
                className="rounded px-1.5 py-0.5 font-[var(--font-mono)] text-[12px]"
                style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
              >
                {s.keys}
              </span>
            </div>
          ))}
        </Section>
      ))}
      <p className="pl-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Shortcuts are fixed in this version.
      </p>
    </>
  );
}

export function ConnectionsPage({ s, patch, selectId }: { s: Settings; patch: Patch; selectId?: string }) {
  const [selected, setSelected] = useState(
    Math.max(
      0,
      s.connections.findIndex((c) => c.id === selectId),
    ),
  );
  const [test, setTest] = useState<{ ok?: string; err?: string; busy?: boolean }>({});
  const list = s.connections;
  const conn: Connection | undefined = list[selected];
  const setList = (next: Connection[]) => patch((x) => ({ ...x, connections: next }));
  const field = (p: Partial<Connection>) => setList(list.map((c, i) => (i === selected ? { ...c, ...p } : c)));

  return (
    <div className="flex h-full min-h-0 min-w-0 gap-3">
      <div className="flex w-[300px] shrink-0 flex-col rounded-[4px]" style={{ border: "1px solid var(--border)" }}>
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {list.map((c, i) => (
            <div
              key={c.id}
              onClick={() => {
                setSelected(i);
                setTest({});
              }}
              className="mx-1 flex h-[24px] items-center gap-2 rounded px-2 text-[13px]"
              style={{ background: i === selected ? "var(--sel-focus)" : undefined, color: i === selected ? "#fff" : undefined }}
            >
              <SourceIcon kind={c.kind} />
              <span className="truncate">{c.name || "untitled"}</span>
              <span className="ml-auto shrink-0 text-[10px]" style={{ color: i === selected ? "#fff" : "var(--text-muted)" }}>
                {KIND_NAME[c.kind]}
              </span>
            </div>
          ))}
          {!list.length && (
            <p className="px-2 py-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
              No connections
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 p-1.5" style={{ borderTop: "1px solid var(--border)" }}>
          {(Object.keys(SOURCE_KINDS) as SourceKind[]).map((kind) => (
            <Button
              key={kind}
              tip={`Add ${kind === "kibana" ? "an" : "a"} ${SOURCE_KINDS[kind].label} connection`}
              onClick={() => {
                setList([...list, { ...newConnection(), kind, name: `${kind}-${list.length + 1}` }]);
                setSelected(list.length);
                setTest({});
              }}
            >
              <span className="flex items-center gap-1">
                ＋ <SourceIcon kind={kind} />
              </span>
            </Button>
          ))}
          <Button
            disabled={!conn}
            tip="Delete the selected connection"
            onClick={() => {
              setList(list.filter((_, i) => i !== selected));
              setSelected(0);
            }}
          >
            <Trash2 size={12} />
          </Button>
          <label
            className="ml-auto shrink-0 cursor-pointer px-1 text-[11px] whitespace-nowrap"
            style={{ color: "var(--accent)" }}
            title="Read connections from a .env file"
          >
            Import
            <input
              type="file"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setList([...list, ...connectionsFromEnv(await f.text())]);
              }}
            />
          </label>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
        {conn ? (
          <>
            <Section title="Connection">
              <Row label="Name">
                <Text value={conn.name} onChange={(v) => field({ name: v })} width={200} placeholder="prod" />
              </Row>
              <Row label="Source" hint="Which kind of server the logs come from. Queries are Lucene on both.">
                <Select
                  value={conn.kind}
                  onChange={(kind: SourceKind) => field({ kind })}
                  width={200}
                  options={(Object.keys(SOURCE_KINDS) as SourceKind[]).map((k) => ({
                    value: k,
                    label: SOURCE_KINDS[k].label,
                    icon: <SourceIcon kind={k} size={14} />,
                  }))}
                />
              </Row>
              {conn.kind === "local" ? (
                <Row
                  label="Folder"
                  hint="A folder of logs — every .log, .jsonl and rotated .log.1 under it is a stream — or one file. Write docker to read the running containers instead."
                >
                  <span className="flex items-center gap-2">
                    <Text value={conn.url} onChange={(v) => field({ url: v })} placeholder={SOURCE_KINDS.local.url} mono />
                    <Button
                      onClick={async () => {
                        const dir = await openFolder({ directory: true, multiple: false });
                        if (typeof dir === "string") field({ url: dir });
                      }}
                    >
                      Choose…
                    </Button>
                  </span>
                </Row>
              ) : (
                <>
                  <Row label={conn.kind === "kibana" ? "Kibana URL" : "Graylog URL"}>
                    <Text value={conn.url} onChange={(v) => field({ url: v })} placeholder={SOURCE_KINDS[conn.kind].url} mono />
                  </Row>
                  <Row
                    label={conn.kind === "kibana" ? "API key" : "Access token"}
                    hint={`${SOURCE_KINDS[conn.kind].token} Kept in connections.json on this machine, never in an export.`}
                  >
                    <Text value={conn.token} onChange={(v) => field({ token: v })} type="password" mono />
                  </Row>
                </>
              )}
            </Section>
            <div className="flex flex-wrap items-center gap-2 pl-[162px]">
              <Button
                onClick={async () => {
                  setTest({ busy: true });
                  try {
                    const source = clientFor(conn);
                    const [v, streams] = await Promise.all([source.version(), source.streams()]);
                    const kind = SOURCE_KINDS[conn.kind];
                    setTest({ ok: `${kind.label} ${v} · ${streams.length} ${kind.streams}` });
                  } catch (err) {
                    setTest({ err: failureReason(err) });
                  }
                }}
              >
                {test.busy ? "Testing…" : "Test Connection"}
              </Button>
              {test.ok && (
                <span className="flex min-w-0 items-center gap-1 text-[12px]" style={{ color: "var(--green)" }}>
                  <Check size={12} /> <span className="truncate">{test.ok}</span>
                </span>
              )}
              {test.err && (
                <span className="min-w-0 basis-full truncate text-[12px]" style={{ color: "var(--red)" }}>
                  {test.err}
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="pt-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
            Add a Graylog or a Kibana connection with ＋, or import Graylog ones from a .env file.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Projects group a connection's streams into the services they belong to, which is what
 * gives the tree its third level. Purely a naming convenience: no project means the
 * streams simply sit under the connection.
 */
export function ProjectsPage({ s, patch }: { s: Settings; patch: Patch }) {
  const [connId, setConnId] = useState(s.connections[0]?.id ?? "");
  const [streams, setStreams] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const conn = s.connections.find((c) => c.id === connId);
  const projects = s.projects.filter((p) => p.connectionId === connId);
  const project = projects.find((p) => p.id === selected) ?? projects[0];
  const setList = (next: typeof s.projects) => patch((x) => ({ ...x, projects: next }));
  const field = (p: Partial<(typeof s.projects)[number]>) => setList(s.projects.map((x) => (x.id === project?.id ? { ...x, ...p } : x)));

  const indexing = useContext(Indexing);
  // the stream list comes from the cache, and only reaches Graylog when there is none
  useEffect(() => {
    if (!conn || indexing) return;
    let alive = true;
    void (async () => {
      setLoading(true);
      const cached = await cache.load(cache.cacheKey(conn.id));
      if (alive && cached.streams.length) setStreams(cached.streams);
      try {
        const fresh = await clientFor(conn).streams();
        await cache.putStreams(cache.cacheKey(conn.id), fresh);
        if (alive) setStreams(fresh);
      } catch {
        /* keep whatever the cache had */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [conn, indexing]);

  const claimedElsewhere = (streamId: string) => projects.some((p) => p.id !== project?.id && p.streams.includes(streamId));

  // handing a set-up over works from an empty install too: that is who it is for
  const share = (
    <>
      <ShareSetup s={s} patch={patch} />
      <Section title="Code">
        <Row label="Open files in" hint="A file and line named in a log — a stack trace, an error — opens here, in the project's folder.">
          <Select value={s.editor.ide} onChange={(v) => patch((x) => ({ ...x, editor: { ...x.editor, ide: v } }))} options={IDES} />
        </Row>
      </Section>
    </>
  );

  if (!s.connections.length) {
    return (
      <>
        {share}
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Add a connection first; projects group the streams it exposes.
        </p>
      </>
    );
  }

  return (
    <>
      {share}
      <Section title="Projects">
        <Row label="Connection">
          <Select
            value={connId}
            onChange={(v) => {
              setConnId(v);
              setSelected(null);
            }}
            options={s.connections.map((c) => ({ value: c.id, label: c.name || c.url }))}
          />
        </Row>
      </Section>

      <div className="flex min-h-0 gap-3">
        <div className="flex w-[190px] shrink-0 flex-col rounded-[4px]" style={{ border: "1px solid var(--border)" }}>
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelected(p.id)}
                className="mx-1 flex h-[24px] items-center gap-2 rounded px-2 text-[13px]"
                style={{ background: p.id === project?.id ? "var(--sel-focus)" : undefined, color: p.id === project?.id ? "#fff" : undefined }}
              >
                <span className="truncate">{p.name || "untitled"}</span>
                <span className="ml-auto shrink-0 text-[11px] opacity-70">{p.streams.length}</span>
              </div>
            ))}
            {!projects.length && (
              <p className="px-2 py-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                No projects
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 p-1.5" style={{ borderTop: "1px solid var(--border)" }}>
            <Button
              onClick={() => {
                const created = { ...newProject(connId), name: `project-${projects.length + 1}` };
                setList([...s.projects, created]);
                setSelected(created.id);
              }}
            >
              ＋
            </Button>
            <Button disabled={!project} onClick={() => project && setList(s.projects.filter((x) => x.id !== project.id))}>
              <Trash2 size={12} />
            </Button>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
          {project ? (
            <>
              <Row label="Name">
                <Text value={project.name} onChange={(v) => field({ name: v })} width={200} placeholder="payments-api" />
              </Row>
              <Row label="GitHub repository" hint="Shown beside the project in the tree. Optional.">
                <Text value={project.github ?? ""} onChange={(v) => field({ github: v || undefined })} placeholder="owner/repo" mono />
              </Row>
              <ProjectFolderRow projectId={project.id} />
              <Row
                label="Path on the servers"
                hint="Taken off a file named in a log to find it in the folder above. Leave empty for the usual roots, /var/www/html and the like."
              >
                <Text
                  value={project.sourcePrefix ?? ""}
                  onChange={(v) => field({ sourcePrefix: v || undefined })}
                  width={260}
                  placeholder="/var/www/html"
                  mono
                />
              </Row>
              <Row label="Streams" hint={loading ? "Loading the stream list…" : "A stream can belong to one project."}>
                <div className="max-h-[220px] overflow-auto rounded-[4px]" style={{ border: "1px solid var(--border)" }}>
                  {streams.map((st) => {
                    const taken = claimedElsewhere(st.id);
                    const on = project.streams.includes(st.id);
                    return (
                      <label
                        key={st.id}
                        className="flex h-[24px] items-center gap-2 px-2 text-[12px]"
                        style={{ opacity: taken ? 0.45 : 1 }}
                        title={taken ? "Already in another project" : st.id}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={taken}
                          onChange={() => field({ streams: on ? project.streams.filter((x) => x !== st.id) : [...project.streams, st.id] })}
                        />
                        <span className="truncate">{st.title}</span>
                        <span className="ml-auto shrink-0 font-[var(--font-mono)] text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {st.id.slice(0, 8)}
                        </span>
                      </label>
                    );
                  })}
                  {!streams.length && !loading && (
                    <p className="px-2 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      No streams; check the connection.
                    </p>
                  )}
                </div>
              </Row>
            </>
          ) : (
            <p className="pt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
              Add a project with ＋, then tick the streams it owns.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Where this project is checked out here. It is the one thing on this page that belongs to
 * the machine rather than to the project, so it is kept out of the shared settings file.
 */
function ProjectFolderRow({ projectId }: { projectId: string }) {
  const { projectFolders, setProjectFolder } = useApp();
  const folder = projectFolders[projectId] ?? "";
  return (
    <Row label="Project folder" hint="Where a terminal for this project opens. Stays on this machine.">
      <div className="flex items-center gap-1.5">
        <Text value={folder} onChange={(v) => setProjectFolder(projectId, v)} width={260} placeholder="~/src/payments-api" mono />
        <Button
          onClick={() =>
            void openFolder({ directory: true, multiple: false }).then((picked) => {
              if (typeof picked === "string") setProjectFolder(projectId, picked);
            })
          }
        >
          Choose…
        </Button>
      </div>
    </Row>
  );
}

/**
 * The projects, and the connections under them, as one file to send — and the way in for the
 * one who receives it. Tokens never travel: a connection arrives as a name and a URL, and the
 * page says which ones still need one.
 */
function ShareSetup({ s, patch }: { s: Settings; patch: Patch }) {
  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [withQueries, setWithQueries] = useState(true);
  const saved = useApp((z) => z.savedQueries);
  const [said, setSaid] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const open = () => {
    setPicked(new Set(s.projects.map((p) => p.id)));
    setChoosing(true);
  };

  const write = async () => {
    setChoosing(false);
    const path = await saveDialog({ defaultPath: bundleName(), filters: [{ name: "Flux set-up", extensions: ["json"] }] });
    if (!path) return;
    const bundle = makeBundle(s, [...picked], new Date(), withQueries ? saved : []);
    try {
      await invoke("save_file", { path, contents: JSON.stringify(bundle, null, 2) });
      const queries = bundle.queries?.length ? `, ${bundle.queries.length} saved queries` : "";
      setSaid({
        tone: "ok",
        text: `${bundle.projects.length} projects on ${bundle.connections.length} connections${queries} written, without their tokens.`,
      });
    } catch (e) {
      setSaid({ tone: "bad", text: failureReason(e) });
    }
  };

  const take = async (file: File) => {
    const bundle = readBundle(await file.text());
    if (!bundle) return setSaid({ tone: "bad", text: `${file.name} is not a Flux set-up.` });
    const m = mergeBundle(s, bundle, undefined, saved);
    patch(() => m.settings);
    // the queries go to the panel straight away: they are the workspace's, not the draft's
    useApp.getState().addSavedQueries(m.queries);
    const parts = [
      m.projectsAdded && `${m.projectsAdded} projects added`,
      m.projectsGrown && `${m.projectsGrown} grown`,
      m.connectionsAdded && `${m.connectionsAdded} connections added`,
      m.queries.length && `${m.queries.length} saved queries added`,
    ].filter(Boolean);
    const tokens = m.needToken.length ? ` Add a token to ${m.needToken.map((c) => c.name || c.url).join(", ")} on the Connections page.` : "";
    setSaid({ tone: "ok", text: `${parts.length ? parts.join(", ") : "Nothing new"}.${tokens} Apply to keep it.` });
  };

  const byConnection = s.connections
    .map((c) => ({ c, projects: s.projects.filter((p) => p.connectionId === c.id) }))
    .filter((g) => g.projects.length);

  return (
    <Section title="Share">
      <Row hint="Projects and the connections under them as one file, for someone setting Flux up. Tokens are never in it.">
        <span className="flex items-center gap-2">
          <Button disabled={!s.projects.length} onClick={open}>
            Export…
          </Button>
          <label
            className="flex h-[24px] cursor-pointer items-center rounded-[4px] px-2.5 text-[12px]"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Add from export…
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void take(f);
              }}
            />
          </label>
        </span>
      </Row>
      {said && (
        <Row>
          <p className="text-[12px]" style={{ color: said.tone === "ok" ? "var(--text-dim)" : "var(--red)" }}>
            {said.text}
          </p>
        </Row>
      )}

      {choosing && (
        <ConfirmDialog
          title="Export projects"
          message="Choose what goes in the file. Connections go with the projects that need them, without their tokens."
          confirmLabel={`Export ${picked.size}`}
          danger={false}
          extra={
            <div className="max-h-[280px] overflow-auto rounded-[4px] p-1.5" style={{ border: "1px solid var(--border)" }}>
              {byConnection.map(({ c, projects }) => {
                const all = projects.every((p) => picked.has(p.id));
                return (
                  <div key={c.id} className="mb-1.5">
                    <Checkbox
                      checked={all}
                      onChange={(v) =>
                        setPicked((cur) => {
                          const next = new Set(cur);
                          for (const p of projects) {
                            if (v) next.add(p.id);
                            else next.delete(p.id);
                          }
                          return next;
                        })
                      }
                      label={c.name || c.url}
                    />
                    <div className="ml-5">
                      {projects.map((p) => (
                        <Checkbox
                          key={p.id}
                          checked={picked.has(p.id)}
                          onChange={(v) =>
                            setPicked((cur) => {
                              const next = new Set(cur);
                              if (v) next.add(p.id);
                              else next.delete(p.id);
                              return next;
                            })
                          }
                          label={`${p.name || "Untitled project"} · ${p.streams.length} streams`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="mt-2 pt-1.5" style={{ borderTop: "1px solid var(--border-soft)" }}>
                <Checkbox
                  checked={withQueries}
                  onChange={setWithQueries}
                  label="Include the saved queries on these projects' streams"
                  hint="Without whether they are watched, which is yours to decide."
                />
              </div>
            </div>
          }
          onConfirm={() => picked.size && void write()}
          onCancel={() => setChoosing(false)}
        />
      )}
    </Section>
  );
}

/** Where an issue started from a log line is filed. */
export function JiraPage({ s, patch }: { s: Settings; patch: Patch }) {
  const j = s.jira;
  const set = <K extends keyof typeof j>(k: K, v: (typeof j)[K]) => patch((x) => ({ ...x, jira: { ...x.jira, [k]: v } }));
  return (
    <Section title="Jira">
      <Row label="Site" hint="Issues open in your browser, which is already signed in. Flux keeps no Jira token.">
        <Text value={j.site} onChange={(v) => set("site", v.trim())} width={300} placeholder="https://acme.atlassian.net" mono />
      </Row>
      <Row
        label="Project id"
        hint="The project's number, not its key: Jira's create link takes the number. It is in the URL of the project's settings page, or ask an admin."
      >
        <Text value={j.projectId} onChange={(v) => set("projectId", v.replace(/\D/g, ""))} width={140} placeholder="10042" mono />
      </Row>
      <Row label="Issue type id" hint="Leave empty for the project's default; 10004 is a Bug on most sites.">
        <Text value={j.issueTypeId} onChange={(v) => set("issueTypeId", v.replace(/\D/g, ""))} width={140} placeholder="10004" mono />
      </Row>
    </Section>
  );
}

/** The terminal's own settings: the engine behind it, and what quitting does to it. */
export function TerminalPage({ s, patch }: { s: Settings; patch: Patch }) {
  const t = s.terminal;
  const set = <K extends keyof typeof t>(k: K, v: (typeof t)[K]) => patch((x) => ({ ...x, terminal: { ...x.terminal, [k]: v } }));
  return (
    <>
      <Section title="Sessions">
        <Row
          label="Terminal engine"
          hint="The shell is what every machine has. tmux keeps a session running after Flux closes, and gives it back where you left it."
        >
          <Select
            value={t.engine}
            onChange={(v) => set("engine", v)}
            options={[
              { value: "shell", label: "Shell" },
              { value: "tmux", label: "tmux" },
            ]}
          />
        </Row>
        {t.engine === "tmux" && (
          <>
            <TmuxCheck settings={t} />
            <Row label="tmux path" hint="Leave empty to find it on PATH, through your login shell.">
              <Text value={t.tmuxPath} onChange={(v) => set("tmuxPath", v)} width={260} placeholder="/opt/homebrew/bin/tmux" mono />
            </Row>
          </>
        )}
        <Row label="On quit" hint="What happens to sessions still running when Flux closes.">
          <Select
            value={t.onQuit}
            onChange={(v) => set("onQuit", v)}
            options={[
              { value: "ask", label: "Ask me" },
              { value: "kill", label: "Close them" },
              { value: "leave", label: "Leave them running" },
            ]}
          />
        </Row>
      </Section>
      <Section title="Shell">
        <Row label="Shell" hint="Leave empty for your login shell.">
          <Text value={t.shell} onChange={(v) => set("shell", v)} width={260} placeholder="/bin/zsh" mono />
        </Row>
      </Section>
    </>
  );
}

/**
 * Whether the tmux that was chosen is actually there, asked of the machine rather than
 * assumed: the setting is the one place to find out before a terminal fails to open with it.
 */
function TmuxCheck({ settings }: { settings: TerminalSettings }) {
  const [found, setFound] = useState<boolean | null>(null);
  const tmux = settings.tmuxPath.trim() || "tmux";
  const shell = settings.shell.trim();

  useEffect(() => {
    let current = true;
    void invoke("terminal_run", { program: shell, args: ["-l", "-c", `command -v ${tmux} >/dev/null`] })
      .then(() => current && setFound(true))
      .catch(() => current && setFound(false));
    return () => {
      current = false;
    };
  }, [tmux, shell]);

  if (found !== false) return null;
  return (
    <Row>
      <p className="text-[12px]" style={{ color: "var(--amber)" }}>
        {tmux} was not found. Install it — <span className="font-[var(--font-mono)]">brew install tmux</span> — or leave the engine on Shell; until
        then a terminal opens without persistence.
      </p>
    </Row>
  );
}

/** What the app does about new versions, and when it last looked. */
export function UpdatesPage({ s, patch }: { s: Settings; patch: Patch }) {
  const u = s.updates;
  const { checkForUpdates } = useApp();
  const set = <K extends keyof typeof u>(k: K, v: (typeof u)[K]) => patch((x) => ({ ...x, updates: { ...x.updates, [k]: v } }));
  return (
    <>
      <Section title="Updates">
        <Row>
          <Checkbox
            checked={u.checkOnStartup}
            onChange={(v) => set("checkOnStartup", v)}
            label="Check for updates automatically"
            hint="Once at startup and once an hour after that. Nothing is sent about you or your connections."
          />
        </Row>
        <Row label="Last checked" hint="A version is offered once it has been published for a few minutes.">
          <div className="flex items-center gap-2">
            <span className="text-[12px]" style={{ color: "var(--text-dim)" }}>
              {u.lastCheckedAt ? new Date(u.lastCheckedAt).toLocaleString() : "never"}
            </span>
            <Button onClick={() => void checkForUpdates(true)}>Check now</Button>
          </div>
        </Row>
      </Section>
    </>
  );
}

/** The folder that is open, and what it takes with it. */
export function WorkspacePage({ s }: { s: Settings; patch: Patch }) {
  const { workspaceFolder, workspaceConnections, setWorkspaceConnections, closeWorkspace } = useApp();
  const [home, setHome] = useState("");

  useEffect(() => {
    void import("@tauri-apps/api/path").then(({ homeDir }) => homeDir().then((h) => setHome(h.replace(/\/$/, ""))));
  }, []);

  if (!workspaceFolder) {
    return (
      <Section title="Workspace">
        <Row hint="Open one from the Flux menu in the title bar. A workspace keeps its stream grouping and its layout in a .flux directory inside the folder.">
          <span className="text-[12px]" style={{ color: "var(--text-dim)" }}>
            No workspace is open.
          </span>
        </Row>
      </Section>
    );
  }

  const toggle = (id: string) => {
    // an empty list means every connection, so the first tick has to start from all of them
    const current = workspaceConnections.length ? workspaceConnections : s.connections.map((c) => c.id);
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    void setWorkspaceConnections(next.length === s.connections.length ? [] : next);
  };

  return (
    <>
      <Section title="Workspace">
        <Row label="Folder">
          <div className="flex items-center gap-2">
            <span className="font-[var(--font-mono)] text-[12px]" style={{ color: "var(--text-dim)" }}>
              {shortPath(workspaceFolder, home)}
            </span>
            <Button onClick={() => void closeWorkspace()}>Close</Button>
          </div>
        </Row>
        <Row label="Name" hint="The folder's own name, as the title bar shows it.">
          <span className="text-[12px]" style={{ color: "var(--text-dim)" }}>
            {workspaceName(workspaceFolder)}
          </span>
        </Row>
      </Section>

      <Section title="Connections in this workspace">
        <Row hint="Tick the ones this folder works with. With none ticked it shows them all. Connections themselves stay out of the folder: they hold access tokens.">
          <div className="max-h-[220px] w-full overflow-auto rounded-[4px]" style={{ border: "1px solid var(--border)" }}>
            {s.connections.length ? (
              s.connections.map((c) => (
                <label key={c.id} className="flex h-[24px] items-center gap-2 px-2 text-[12px]">
                  <input
                    type="checkbox"
                    checked={!workspaceConnections.length || workspaceConnections.includes(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                  <span className="truncate">{c.name || c.url}</span>
                  <span className="ml-auto shrink-0 truncate text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {c.url}
                  </span>
                </label>
              ))
            ) : (
              <div className="px-2 py-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                No connections
              </div>
            )}
          </div>
        </Row>
      </Section>
    </>
  );
}

/** The server an agent talks to while Flux is open. */
export function McpPage({ s, patch }: { s: Settings; patch: Patch }) {
  const m = s.mcp;
  const [copied, setCopied] = useState("");
  const set = <K extends keyof typeof m>(k: K, v: (typeof m)[K]) => patch((x) => ({ ...x, mcp: { ...x.mcp, [k]: v } }));
  const { url, json, cli } = clientConfig(m.port, m.token);

  // the token is made once and kept, so a config copied today still works tomorrow
  const enable = (on: boolean) => patch((x) => ({ ...x, mcp: { ...x.mcp, enabled: on, token: x.mcp.token || crypto.randomUUID() } }));

  const copy = (what: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(""), 1400);
    });
  };

  return (
    <>
      <Section title="MCP Server">
        <Row>
          <Checkbox
            checked={m.enabled}
            onChange={enable}
            label="Enable MCP Server"
            hint="While Flux is open, an agent can read the same logs through the same connections."
          />
        </Row>
        <Row label="Address" hint="Loopback only: nothing outside this machine can reach it.">
          <span className="font-[var(--font-mono)] text-[12px]" style={{ color: m.enabled ? "var(--text-dim)" : "var(--text-muted)" }}>
            {url}
          </span>
        </Row>
        <Row label="Port" hint="Takes effect when the server is next enabled.">
          <Num value={m.port} onChange={(v) => set("port", v)} min={1024} max={65535} width={90} />
        </Row>
      </Section>

      <Section title="Client configuration">
        <Row label="Claude Code" hint="Paste into .mcp.json, or run the command. The header is what lets it in.">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button disabled={!m.token} onClick={() => copy("json", json)}>
                {copied === "json" ? "Copied" : "Copy JSON"}
              </Button>
              <Button disabled={!m.token} onClick={() => copy("cli", cli)}>
                {copied === "cli" ? "Copied" : "Copy command"}
              </Button>
              <Button disabled={!m.token} onClick={() => copy("token", m.token)}>
                {copied === "token" ? "Copied" : "Copy token"}
              </Button>
            </div>
            <pre
              className="selectable max-h-[160px] overflow-auto rounded-[4px] p-2 font-[var(--font-mono)] text-[11px]"
              style={{ background: "var(--bg-editor)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
            >
              {m.token ? json : "Enable the server to get a token."}
            </pre>
          </div>
        </Row>
      </Section>

      <Section title="What it offers">
        <Row hint="Flux never writes to Graylog, Kibana or Elasticsearch, and the tokens themselves are never part of an answer. The last two reach into this window: what you are looking at, and a console opened for you to look at.">
          <ul className="flex flex-col gap-0.5 text-[12px]" style={{ color: "var(--text-dim)" }}>
            <li>list_connections — the connections Flux is set up with</li>
            <li>list_streams — the streams a connection exposes</li>
            <li>search_logs — a Lucene search, newest first</li>
            <li>count_logs — how many match, without returning them</li>
            <li>list_endpoints — endpoints a stream serves, with traffic and error rates</li>
            <li>current_view — the query, range and selected row of the tab in front</li>
            <li>open_query — a console opened and run in this window, for you to see</li>
          </ul>
        </Row>
      </Section>
    </>
  );
}

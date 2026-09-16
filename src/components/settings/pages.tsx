import { useState } from "react";
import { Check, Plug, Trash2 } from "lucide-react";
import { Button, Checkbox, Num, Row, Section, Select, Swatches, Text } from "./controls";
import { Graylog, QUICK_RANGES } from "@/lib/graylog";
import { ping } from "@/lib/mongo";
import { connectionsFromEnv, newConnection, SHORTCUTS, type Connection, type Settings } from "@/lib/settings";

export type Patch = (p: (s: Settings) => Settings) => void;

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
        <Row label="Look back" hint="The window used to decide which endpoints exist and how busy they are.">
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
        <Row label="Rows per query" hint="Graylog is asked for this many messages. Above 10,000 the index refuses the request.">
          <Num value={r.pageSize} onChange={(v) => set("pageSize", v)} min={50} max={10000} step={50} width={110} />
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

export function AdvancedPage({ s, patch, onReset }: { s: Settings; patch: Patch; onReset: () => void }) {
  const a = s.advanced;
  const set = <K extends keyof typeof a>(k: K, v: (typeof a)[K]) => patch((x) => ({ ...x, advanced: { ...x.advanced, [k]: v } }));
  return (
    <>
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

export function DataSourcesPage({ s, patch, selectId }: { s: Settings; patch: Patch; selectId?: string }) {
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
      <div className="flex w-[170px] shrink-0 flex-col rounded-[4px]" style={{ border: "1px solid var(--border)" }}>
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
              <Plug size={12} />
              <span className="truncate">{c.name || "untitled"}</span>
            </div>
          ))}
          {!list.length && (
            <p className="px-2 py-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
              No data sources
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 p-1.5" style={{ borderTop: "1px solid var(--border)" }}>
          <Button
            onClick={() => {
              setList([...list, { ...newConnection(), name: `graylog-${list.length + 1}` }]);
              setSelected(list.length);
            }}
          >
            ＋
          </Button>
          <Button
            disabled={!conn}
            onClick={() => {
              setList(list.filter((_, i) => i !== selected));
              setSelected(0);
            }}
          >
            <Trash2 size={12} />
          </Button>
          <label className="ml-auto cursor-pointer text-[11px]" style={{ color: "var(--accent)" }} title="Import a watchdog .env">
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
              <Row label="Graylog URL">
                <Text value={conn.graylogUrl} onChange={(v) => field({ graylogUrl: v })} placeholder="https://graylog.example.com:9000" mono />
              </Row>
              <Row label="Access token" hint="Graylog profile › Edit tokens. Stored on this machine only.">
                <Text value={conn.graylogToken} onChange={(v) => field({ graylogToken: v })} type="password" mono />
              </Row>
            </Section>
            <Section title="watchdog integration">
              <Row label="Environment" hint="Which `env` value the watchdog data uses. Defaults to the name above.">
                <Text value={conn.env ?? ""} onChange={(v) => field({ env: v || undefined })} width={200} placeholder={conn.name} />
              </Row>
              <Row label="MongoDB URI" hint="Read-only. Supplies normalized endpoints and traffic counts.">
                <Text
                  value={conn.mongoUri ?? ""}
                  onChange={(v) => field({ mongoUri: v || undefined })}
                  placeholder="mongodb://localhost:27017/watchdog"
                  mono
                />
              </Row>
              <Row label="Config file" hint="Groups streams under the GitHub project that owns them.">
                <Text
                  value={conn.configPath ?? ""}
                  onChange={(v) => field({ configPath: v || undefined })}
                  placeholder="…/watchdog.config.yaml"
                  mono
                />
              </Row>
            </Section>
            <div className="flex flex-wrap items-center gap-2 pl-[162px]">
              <Button
                onClick={async () => {
                  setTest({ busy: true });
                  try {
                    const v = await new Graylog(conn.graylogUrl, conn.graylogToken).version();
                    const extra = conn.mongoUri ? ` · mongo ${await ping(conn.mongoUri)}` : "";
                    setTest({ ok: `Graylog ${v}${extra}` });
                  } catch (err) {
                    setTest({ err: (err as Error).message });
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
            Add a data source with ＋, or import one from a watchdog .env file.
          </p>
        )}
      </div>
    </div>
  );
}

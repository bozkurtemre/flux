// What is going on behind the tab in front — queries still running, consoles following new
// messages, the saved queries being watched and what their last round found — worked out here
// and sent to the island, which is a window of its own under the notch and has no store.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { emitTo, listen } from "@tauri-apps/api/event";
import { ago, took, type IslandItem } from "@/lib/island";
import { watchEvery } from "@/lib/queries";
import { absolute } from "@/lib/datasource";
import { mergesCommand, readMerges, type Marker } from "@/lib/deploys";
import { ERROR_FIELDS, errorQueryFrom } from "@/lib/monitor";
import { onRadar, radarLine, RADAR_MINUTES, worse } from "@/lib/radar";
import { clientFor, useApp } from "@/store";

interface Radar {
  key: string;
  title: string;
  detail: string;
  worse: boolean;
  at: number;
}

/**
 * Every minute, the merges of the last ten minutes into each project's repository, and for each
 * one the project's failures since it against the ten minutes before it. Anything that goes
 * wrong — no `gh`, not signed in, a source that does not answer — is no row, not an error.
 */
function useDeployRadar(on: boolean): Radar[] {
  const { projects, connections, terminal } = useApp((s) => s.settings);
  const [radar, setRadar] = useState<Radar[]>([]);
  useEffect(() => {
    if (!on) return;
    const abort = new AbortController();
    const signal = abort.signal;
    const watched = projects.filter((p) => p.github && p.streams.length);
    const look = async () => {
      const now = Date.now();
      const found = await Promise.all(
        watched.map(async (project) => {
          const conn = connections.find((c) => c.id === project.connectionId);
          if (!conn) return [];
          const out = await invoke<string>("terminal_run", {
            program: terminal.shell.trim(),
            args: ["-l", "-c", mergesCommand(project.github!, new Date(now - RADAR_MINUTES * 60_000), new Date(now))],
          }).catch(() => "[]");
          const client = clientFor(conn);
          const streams = project.streams;
          return Promise.all(
            readMerges(out)
              .filter((m) => onRadar(m.at, now))
              .map(async (m: Marker): Promise<Radar | null> => {
                const merged = new Date(m.at);
                const before = absolute(new Date(merged.getTime() - RADAR_MINUTES * 60_000), merged);
                const since = absolute(merged, new Date(now));
                // what the lines carry decides what a failure is, as on the Monitor
                const sample = await client.messages({
                  query: "*",
                  streams,
                  timerange: absolute(new Date(merged.getTime() - RADAR_MINUTES * 60_000), new Date(now)),
                  fields: ERROR_FIELDS,
                  size: 200,
                  signal,
                });
                const errors = errorQueryFrom(sample.rows);
                if (!errors) return null;
                const count = (query: string, timerange: typeof since) => client.count({ query, streams, timerange, signal });
                const [bt, be, at, ae] = await Promise.all([count("*", before), count(errors, before), count("*", since), count(errors, since)]);
                const b = { total: bt, errors: be };
                const a = { total: at, errors: ae };
                return {
                  // per project as well as per PR: projects that share a repository each report
                  // the same merge, and two rows under one key left the island's list with rows
                  // React no longer owned, invisible and taking up the room above the rest
                  key: `deploy:${project.id}|${m.url}`,
                  title: `${project.name || project.github} · ${m.label}`,
                  detail: radarLine(b, a, now - merged.getTime()),
                  worse: worse(b, a),
                  at: merged.getTime(),
                };
              })
              .map((p) => p.catch(() => null)),
          );
        }),
      );
      if (!signal.aborted) setRadar(found.flat().filter((r): r is Radar => !!r));
    };
    void look();
    const every = setInterval(() => void look(), 60_000);
    return () => {
      abort.abort();
      clearInterval(every);
    };
  }, [on, projects, connections, terminal.shell]);
  return on ? radar : [];
}

export function Island() {
  const { tabs, savedQueries, watchLog, settings, mcpCall, update, islandMutedUntil, commandDone, errorLedgers } = useApp();
  const radar = useDeployRadar(settings.appearance.island && settings.appearance.deployRadar !== false);

  const items: IslandItem[] =
    !settings.appearance.island || islandMutedUntil
      ? []
      : [
          ...tabs
            .filter((t) => t.running)
            .map((t) => ({ key: `run:${t.id}`, title: t.title, detail: t.query.trim() || "*", state: "running" as const, at: t.startedAt })),
          ...tabs
            .filter((t) => t.follow && !t.running)
            .map((t) => ({
              key: `follow:${t.id}`,
              title: t.title,
              detail: t.tail?.added ? `${t.tail.added} new on the last tick` : "waiting for new messages",
              state: "following" as const,
            })),
          ...savedQueries
            .filter((q) => watchEvery(q, settings.advanced.watchSeconds) > 0)
            .map((q) => {
              const last = watchLog[q.id];
              const every = `every ${ago(watchEvery(q, settings.advanced.watchSeconds) * 1000)}`;
              // a silence watch is in trouble when it is quiet, not when something arrives
              if (q.quietBelow) {
                return {
                  key: `watch:${q.id}`,
                  title: q.name,
                  detail: last ? `${last.found.toLocaleString()} on the last round${last.quiet ? `, fewer than ${q.quietBelow}` : ""}` : every,
                  state: last?.quiet ? ("quiet" as const) : ("watching" as const),
                  at: last?.at,
                };
              }
              return {
                key: `watch:${q.id}`,
                title: q.name,
                detail: last ? (last.found ? `${last.found.toLocaleString()} new on the last round` : "nothing new on the last round") : every,
                state: last?.found ? ("alert" as const) : ("watching" as const),
                at: last?.at,
              };
            }),
          // the newest three errors nobody has looked at yet
          ...Object.entries(errorLedgers)
            .flatMap(([projectId, ledger]) => Object.values(ledger.errors).map((e) => ({ projectId, e })))
            .filter(({ e }) => e.news)
            .sort((a, b) => b.e.lastSeen - a.e.lastSeen)
            .slice(0, 3)
            .map(({ projectId, e }) => ({
              key: `error:${projectId}|${e.template}`,
              title: `${settings.projects.find((p) => p.id === projectId)?.name ?? "A project"}${
                e.news === "back" ? ": back after it was resolved" : e.news === "escalating" ? ": running hot" : ""
              }`,
              detail: e.deploy && e.news === "new" ? `${e.template} · after ${e.deploy.label}` : e.template,
              state: e.news === "escalating" ? ("hot" as const) : ("error" as const),
              at: e.news === "back" ? e.lastSeen : e.firstSeen,
            })),
          ...radar.map((r) => ({
            key: r.key,
            title: r.title,
            detail: r.detail,
            state: r.worse ? ("regressed" as const) : ("deploy" as const),
            at: r.at,
          })),
          ...(commandDone
            ? [
                {
                  key: `term:${commandDone.terminal}`,
                  title: commandDone.command,
                  detail: commandDone.code ? `exit ${commandDone.code} after ${took(commandDone.ms)}` : `finished in ${took(commandDone.ms)}`,
                  state: commandDone.code ? ("failed" as const) : ("done" as const),
                  at: commandDone.at,
                },
              ]
            : []),
          ...(mcpCall
            ? [
                {
                  key: `mcp:${mcpCall.tool}`,
                  title: mcpCall.tool,
                  detail: mcpCall.failed ? `failed · ${mcpCall.detail}` : mcpCall.detail || "no arguments",
                  state: "mcp" as const,
                  at: mcpCall.at,
                },
              ]
            : []),
          // "Later" was said to the balloon; the island would otherwise stay up until it is installed
          ...(update && settings.updates.dismissedVersion !== update.version
            ? [
                {
                  key: `update:${update.version}`,
                  title: `Flux ${update.version} is available`,
                  detail: "Click to update and restart",
                  state: "update" as const,
                },
              ]
            : []),
        ];
  const sent = JSON.stringify(items);

  // only when the list changes, not on every keystroke in a console
  useEffect(() => void emitTo("island", "island-state", JSON.parse(sent)), [sent]);

  // the island asks once it is up, and, once Flux is back in front, what was clicked on it
  useEffect(() => {
    const ready = listen("island-ready", () => void emitTo("island", "island-state", JSON.parse(sent)));
    return () => void ready.then((stop) => stop());
  }, [sent]);
  useEffect(() => {
    const opened = listen<string>("island-open", (e) => {
      const [kind, id] = [e.payload.slice(0, e.payload.indexOf(":")), e.payload.slice(e.payload.indexOf(":") + 1)];
      const app = useApp.getState();
      if (kind === "watch") app.openSavedQuery(id);
      else if (kind === "update") void app.installUpdate();
      else if (kind === "deploy") void openUrl(id.slice(id.indexOf("|") + 1));
      else if (kind === "error") app.showError(id.slice(0, id.indexOf("|")), id.slice(id.indexOf("|") + 1));
      else if (kind === "term") {
        app.setActiveTerminal(id);
        if (!app.showTerminal) app.toggleTerminal();
      } else if (kind !== "mcp") app.setActive(id);
    });
    // stopping a query leaves Flux where it is, behind whatever is in front
    const cancel = listen<string>("island-cancel", (e) => useApp.getState().cancelQuery(e.payload));
    const mute = listen("island-mute", () => useApp.getState().muteIsland(60));
    return () => {
      for (const p of [opened, cancel, mute]) void p.then((stop) => stop());
    };
  }, []);

  return null;
}

// What is going on behind the tab in front — queries still running, consoles following new
// messages, the saved queries being watched and what their last round found — worked out here
// and sent to the island, which is a window of its own under the notch and has no store.
import { useEffect } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { ago, type IslandItem } from "@/lib/island";
import { watchEvery } from "@/lib/queries";
import { useApp } from "@/store";

export function Island() {
  const { tabs, savedQueries, watchLog, settings } = useApp();

  const items: IslandItem[] = !settings.appearance.island
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
      else app.setActive(id);
    });
    return () => void opened.then((stop) => stop());
  }, []);

  return null;
}

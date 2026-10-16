// Import and export from the Connections menu, a step at a time. Both speak the set-up file that
// Settings › Projects shares (lib/bundle): connections, the projects on them and their saved
// queries, never a token. Import also takes a .env, whose Graylog lines do carry tokens.
import { useEffect, useEffectEvent, useMemo, useState, type ReactNode } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Check, KeyRound } from "lucide-react";
import { bundleName, makeBundle, mergeBundle, mergeConnections, readBundle, type Bundle, type Merged } from "@/lib/bundle";
import { connectionsFromEnv } from "@/lib/settings";
import { failureReason } from "@/lib/progress";
import { Checkbox } from "./settings/controls";
import { useApp } from "@/store";

export function TransferWizard({ mode, onClose }: { mode: "import" | "export"; onClose: () => void }) {
  return mode === "export" ? <ExportWizard onClose={onClose} /> : <ImportWizard onClose={onClose} />;
}

/** The dialog both wizards stand in: the steps along the top, what the step asks, its buttons.
 *  Escape closes it and Enter does what the step's main button does, as in the app's other dialogs. */
function Frame({
  title,
  steps,
  at,
  onClose,
  children,
  buttons,
  onEnter,
}: {
  title: string;
  steps: string[];
  at: number;
  onClose: () => void;
  children: ReactNode;
  buttons: ReactNode;
  onEnter?: () => void;
}) {
  const key = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && onEnter) onEnter();
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => key(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div data-modal className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: "rgba(0,0,0,.45)" }} onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[460px] max-w-[94vw] rounded-[10px] p-4"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        <div className="flex items-center gap-3">
          <p className="text-[13px] font-semibold">{title}</p>
          <ol className="ml-auto flex items-center gap-1.5 text-[11px]">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-1.5" style={{ color: i === at ? "var(--text)" : "var(--text-muted)" }}>
                {i > 0 && <span style={{ color: "var(--border)" }}>—</span>}
                <span
                  className="flex size-4 items-center justify-center rounded-full text-[10px]"
                  style={{ background: i < at ? "var(--green)" : i === at ? "var(--accent)" : "var(--bg-raised)", color: "#fff" }}
                >
                  {i < at ? <Check size={10} strokeWidth={3} /> : i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-3 text-[13px]">{children}</div>
        <div className="mt-4 flex justify-end gap-2">{buttons}</div>
      </div>
    </div>
  );
}

function Button({ onClick, primary, disabled, children }: { onClick?: () => void; primary?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-[26px] rounded-[4px] px-3 text-[13px] disabled:opacity-40"
      style={
        primary
          ? { background: "var(--accent)", border: "1px solid var(--accent)", color: "var(--accent-text)" }
          : { background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text)" }
      }
    >
      {children}
    </button>
  );
}

const List = ({ children }: { children: ReactNode }) => (
  <div className="mt-3 max-h-[260px] overflow-auto rounded-[4px] p-1.5" style={{ border: "1px solid var(--border)", background: "var(--bg-input)" }}>
    {children}
  </div>
);
const Dim = ({ children }: { children: ReactNode }) => <p style={{ color: "var(--text-dim)" }}>{children}</p>;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ExportWizard({ onClose }: { onClose: () => void }) {
  const { settings, savedQueries } = useApp();
  const [conns, setConns] = useState(() => new Set(settings.connections.map((c) => c.id)));
  const [projs, setProjs] = useState(() => new Set(settings.projects.map((p) => p.id)));
  const [withQueries, setWithQueries] = useState(true);
  const [written, setWritten] = useState<{ file: string; bundle: Bundle } | null>(null);
  const [problem, setProblem] = useState("");

  // a project goes only with its connection; the connections chosen go whole, with their queries
  const bundle = useMemo(
    () =>
      makeBundle(
        settings,
        settings.projects.filter((p) => projs.has(p.id) && conns.has(p.connectionId)).map((p) => p.id),
        new Date(),
        withQueries ? savedQueries : [],
        [...conns],
      ),
    [settings, savedQueries, conns, projs, withQueries],
  );
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  const write = async () => {
    setProblem("");
    const path = await save({ defaultPath: bundleName(), filters: [{ name: "Flux set-up", extensions: ["json"] }] });
    if (!path) return;
    try {
      await invoke("save_file", { path, contents: JSON.stringify(bundle, null, 2) });
      setWritten({ file: path.split("/").pop() ?? path, bundle });
    } catch (e) {
      setProblem(failureReason(e));
    }
  };

  if (written) {
    const b = written.bundle;
    return (
      <Frame
        title="Export connections"
        steps={["Choose", "Done"]}
        at={1}
        onClose={onClose}
        onEnter={onClose}
        buttons={
          <Button primary onClick={onClose}>
            Done
          </Button>
        }
      >
        <p>
          {plural(b.connections.length, "connection")}, {plural(b.projects.length, "project")} and{" "}
          {plural(b.queries?.length ?? 0, "saved query", "saved queries")} were written to{" "}
          <span className="font-[var(--font-mono)] text-[12px]">{written.file}</span>, without their tokens.
        </p>
        <div className="mt-2">
          <Dim>Whoever opens it with Connections › Import connections… adds their own token to each.</Dim>
        </div>
      </Frame>
    );
  }

  return (
    <Frame
      title="Export connections"
      steps={["Choose", "Done"]}
      at={0}
      onClose={onClose}
      onEnter={() => conns.size && void write()}
      buttons={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button primary disabled={!conns.size} onClick={() => void write()}>
            Export…
          </Button>
        </>
      }
    >
      <Dim>Choose what goes in the file. Tokens never do: whoever opens it adds their own.</Dim>
      <List>
        {settings.connections.map((c) => {
          const projects = settings.projects.filter((p) => p.connectionId === c.id);
          return (
            <div key={c.id} className="mb-1.5">
              <Checkbox
                checked={conns.has(c.id)}
                onChange={(on) => {
                  setConns((cur) => toggle(cur, c.id, on));
                  if (on) setProjs((cur) => new Set([...cur, ...projects.map((p) => p.id)]));
                }}
                label={c.name || c.url}
              />
              <div className="ml-5">
                {projects.map((p) => (
                  <Checkbox
                    key={p.id}
                    checked={conns.has(c.id) && projs.has(p.id)}
                    onChange={(on) => {
                      setProjs((cur) => toggle(cur, p.id, on));
                      // a project is not handed over without the connection it stands on
                      if (on) setConns((cur) => toggle(cur, c.id, true));
                    }}
                    label={p.name}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </List>
      <div className="mt-3">
        <Checkbox
          checked={withQueries}
          onChange={setWithQueries}
          label={`Saved queries on these connections${withQueries ? ` (${bundle.queries?.length ?? 0})` : ""}`}
        />
      </div>
      {problem && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--red)" }}>
          {problem}
        </p>
      )}
    </Frame>
  );
}

type Review =
  { kind: "bundle"; file: string; bundle: Bundle; merged: Merged } | { kind: "env"; file: string; merged: ReturnType<typeof mergeConnections> };

function ImportWizard({ onClose }: { onClose: () => void }) {
  const { settings, savedQueries } = useApp();
  const [review, setReview] = useState<Review | null>(null);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState("");

  const read = async (f: File) => {
    setProblem("");
    const text = await f.text();
    const bundle = readBundle(text);
    if (bundle) return setReview({ kind: "bundle", file: f.name, bundle, merged: mergeBundle(settings, bundle, undefined, savedQueries) });
    const env = connectionsFromEnv(text);
    if (env.length) return setReview({ kind: "env", file: f.name, merged: mergeConnections(settings, env) });
    setProblem(`${f.name} is neither a set-up exported from Flux nor a .env with GRAYLOG_URL and GRAYLOG_TOKEN lines.`);
  };

  const added = review ? (review.kind === "bundle" ? review.merged.needToken : review.merged.added) : [];
  const projectsAdded = review?.kind === "bundle" ? review.merged.projectsAdded : 0;
  const projectsGrown = review?.kind === "bundle" ? review.merged.projectsGrown : 0;
  const queries = review?.kind === "bundle" ? review.merged.queries : [];
  const present = review
    ? review.kind === "bundle"
      ? review.bundle.connections.length - review.merged.needToken.length
      : review.merged.present.length
    : 0;
  const anything = added.length + projectsAdded + projectsGrown + queries.length > 0;
  // a set-up file's connections arrive without a token; a .env's bring theirs
  const needToken = review?.kind === "bundle" ? review.merged.needToken : [];

  const apply = async () => {
    if (!review) return;
    try {
      await useApp.getState().setSettings(review.merged.settings);
      if (queries.length) useApp.getState().addSavedQueries(queries);
      setDone(true);
    } catch (e) {
      setProblem(failureReason(e));
    }
  };

  const addTokens = () => {
    useApp.getState().setShowSettings(true, "connections");
    onClose();
  };

  const steps = ["Choose", "Review", "Done"];
  if (done) {
    return (
      <Frame
        title="Import connections"
        steps={steps}
        at={2}
        onClose={onClose}
        onEnter={needToken.length ? addTokens : onClose}
        buttons={
          needToken.length ? (
            <>
              <Button onClick={onClose}>Later</Button>
              <Button primary onClick={addTokens}>
                Add their tokens…
              </Button>
            </>
          ) : (
            <Button primary onClick={onClose}>
              Done
            </Button>
          )
        }
      >
        <p>
          Imported{" "}
          {[
            plural(added.length, "connection"),
            projectsAdded && plural(projectsAdded, "project"),
            queries.length && plural(queries.length, "saved query", "saved queries"),
          ]
            .filter(Boolean)
            .join(", ")}
          .
        </p>
        {needToken.length > 0 && (
          <div className="mt-2">
            <Dim>
              {needToken.map((c) => c.name || c.url).join(", ")} {needToken.length === 1 ? "needs a token" : "need a token"} before Flux can read from{" "}
              {needToken.length === 1 ? "it" : "them"}: the file never carries one.
            </Dim>
          </div>
        )}
      </Frame>
    );
  }

  if (review) {
    return (
      <Frame
        title="Import connections"
        steps={steps}
        at={1}
        onClose={onClose}
        onEnter={() => anything && void apply()}
        buttons={
          <>
            <Button onClick={() => setReview(null)}>Back</Button>
            <Button primary disabled={!anything} onClick={() => void apply()}>
              Import
            </Button>
          </>
        }
      >
        <Dim>
          From <span className="font-[var(--font-mono)] text-[12px]">{review.file}</span>
          {anything ? ", this is what is new:" : ": everything in it is already set up."}
        </Dim>
        {anything && (
          <List>
            {added.map((c) => (
              <div key={c.id} className="flex items-center gap-2 px-1 py-[3px]">
                <span className="min-w-0 flex-1 truncate">{c.name || c.url}</span>
                <span className="truncate font-[var(--font-mono)] text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {c.url}
                </span>
                {review.kind === "bundle" && <KeyRound size={11} style={{ color: "var(--amber)" }} aria-label="needs a token" />}
              </div>
            ))}
            {projectsAdded > 0 && <p className="px-1 py-[3px]">{plural(projectsAdded, "project")} to add</p>}
            {projectsGrown > 0 && <p className="px-1 py-[3px]">{plural(projectsGrown, "project")} here to gain streams</p>}
            {queries.length > 0 && <p className="px-1 py-[3px]">{plural(queries.length, "saved query", "saved queries")}</p>}
          </List>
        )}
        {present > 0 && (
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
            {plural(present, "connection")} in the file {present === 1 ? "is" : "are"} already set up here, by the same URL, and{" "}
            {present === 1 ? "stays" : "stay"} as {present === 1 ? "it is" : "they are"}.
          </p>
        )}
        {problem && (
          <p className="mt-2 text-[12px]" style={{ color: "var(--red)" }}>
            {problem}
          </p>
        )}
      </Frame>
    );
  }

  return (
    <Frame title="Import connections" steps={steps} at={0} onClose={onClose} buttons={<Button onClick={onClose}>Cancel</Button>}>
      <Dim>
        Choose a set-up exported from Flux (.json), or a .env with GRAYLOG_URL and GRAYLOG_TOKEN lines. Nothing changes until you have seen what is in
        it.
      </Dim>
      <label
        className="mt-3 flex h-[64px] cursor-pointer items-center justify-center rounded-[6px] text-[13px]"
        style={{ border: "1px dashed var(--border)", background: "var(--bg-input)", color: "var(--text-dim)" }}
      >
        Choose a file…
        <input
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void read(f);
          }}
        />
      </label>
      {problem && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--red)" }}>
          {problem}
        </p>
      )}
    </Frame>
  );
}

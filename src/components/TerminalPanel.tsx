// The terminal tool window: a tab per terminal tab, each one a view onto its project's
// session. What every tab runs is worked out in lib/terminal.ts; this file is the screen.
import { useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Plus, X } from "lucide-react";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { openCommand } from "@/lib/terminal";
import { useApp } from "@/store";
import "@xterm/xterm/css/xterm.css";

export function TerminalPanel() {
  const { terminals, activeTerminal, settings, setActiveTerminal, closeTerminal, openTerminal, setShowSettings } = useApp();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // a terminal belongs to a project, so with none defined the menu would open empty; it
  // offers the one thing to do instead
  const projectItems: MenuItem[] = settings.projects.length
    ? settings.projects.map((p) => ({
        label: p.name || "Untitled project",
        onClick: () => openTerminal(p.id, p.name || "Untitled project"),
      }))
    : [
        { label: "No projects yet", disabled: true },
        { separator: true },
        { label: "Add project…", onClick: () => setShowSettings(true, "projects") },
      ];

  return (
    <div className="island flex h-full flex-col overflow-hidden">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b px-1.5" style={{ borderColor: "var(--border-soft)" }}>
        {terminals.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTerminal(t.id)}
            className="group flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px]"
            style={{
              background: t.id === activeTerminal ? "var(--bg-active)" : undefined,
              color: t.id === activeTerminal ? "var(--text)" : "var(--text-dim)",
            }}
          >
            {t.title}
            <X
              size={11}
              className="opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                closeTerminal(t.id);
              }}
            />
          </button>
        ))}
        <button
          className="flex size-6 items-center justify-center rounded-md hover:bg-[var(--bg-hover)]"
          data-tip="New terminal"
          onClick={(e) => setMenu({ x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().bottom + 4 })}
          style={{ color: "var(--text-dim)" }}
        >
          <Plus size={13} />
        </button>
        {menu && <ContextMenu x={menu.x} y={menu.y} items={projectItems} onClose={() => setMenu(null)} />}
      </div>

      <div className="relative min-h-0 flex-1">
        {terminals.map((t) => (
          <TerminalView key={t.id} id={t.id} projectId={t.projectId} hidden={t.id !== activeTerminal} />
        ))}
        {!terminals.length && (
          <div className="flex h-full items-center justify-center text-[12px]" style={{ color: "var(--text-muted)" }}>
            No terminal open. Right-click a project in the tree, or use + above.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One tab's pseudo-terminal. It is mounted for as long as the tab exists, hidden rather than
 * unmounted when another tab is in front, so switching tabs never restarts a shell.
 */
function TerminalView({ id, projectId, hidden }: { id: string; projectId: string; hidden: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");
  // whether there is somewhere to open decides what this renders; the folder itself is read
  // once inside the effect, so editing it later never tears down a running shell
  const hasFolder = useApp((s) => !!s.projectFolders[projectId]);
  // the resize observer below outlives this render, so it reads the current value from a ref
  const hiddenRef = useRef(hidden);

  useEffect(() => {
    hiddenRef.current = hidden;
  }, [hidden]);

  useEffect(() => {
    if (!host.current || !hasFolder) return;
    const folder = useApp.getState().projectFolders[projectId] ?? "";
    // a fresh id per mount: a teardown can then only ever close the pty it opened, however
    // the two interleave under React's double-invoked effects
    const pty = crypto.randomUUID();
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const term = new Terminal({
      fontFamily: v("--font-mono"),
      fontSize: 12,
      cursorBlink: true,
      allowProposedApi: true,
      theme: {
        background: v("--bg-editor"),
        foreground: v("--text"),
        cursor: v("--text"),
        selectionBackground: v("--sel-focus"),
        black: v("--bg-window"),
        red: v("--red"),
        green: v("--green"),
        yellow: v("--amber"),
        blue: v("--accent"),
        magenta: v("--purple"),
        cyan: v("--cyan"),
        white: v("--text"),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();

    // everything except copy and paste belongs to the shell, so a tmux prefix arrives intact
    term.attachCustomKeyEventHandler((e) => {
      if (!e.metaKey || e.type !== "keydown") return true;
      if (e.key === "c" && term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      if (e.key === "v") {
        void navigator.clipboard.readText().then((text) => void invoke("terminal_write", { id: pty, data: text }));
        return false;
      }
      return true;
    });

    const data = new Channel<string>();
    data.onmessage = (chunk) => term.write(chunk);
    const onInput = term.onData((d) => void invoke("terminal_write", { id: pty, data: d }).catch(() => {}));

    let disposed = false;
    void (async () => {
      const configured = useApp.getState().settings.terminal;
      let settings = configured;
      if (configured.useTmux) {
        const tmux = configured.tmuxPath.trim() || "tmux";
        const found = await invoke("terminal_run", {
          program: configured.shell.trim(),
          args: ["-l", "-c", `command -v ${tmux} >/dev/null`],
        })
          .then(() => true)
          .catch(() => false);
        if (!found) {
          settings = { ...configured, useTmux: false };
          setNote("tmux not found: this session will not outlive the app");
          useApp.getState().setTmuxMissing();
        }
      }
      if (disposed) return;
      const cmd = openCommand({ settings, projectId, tabId: id, folder });
      await invoke("terminal_open", {
        spawn: { id: pty, program: cmd.program, args: cmd.args, cwd: cmd.cwd, cols: term.cols, rows: term.rows },
        onData: data,
      }).catch((e: unknown) => term.write(`\r\n\x1b[31m${String(e)}\x1b[0m\r\n`));
    })();

    const observer = new ResizeObserver(() => {
      // hidden tab, or a collapsed panel: fitting to nothing confuses both xterm and tmux
      if (hiddenRef.current || !host.current?.clientHeight || !host.current.clientWidth) return;
      fit.fit();
      void invoke("terminal_resize", { id: pty, cols: term.cols, rows: term.rows }).catch(() => {});
    });
    observer.observe(host.current);

    return () => {
      disposed = true;
      observer.disconnect();
      onInput.dispose();
      term.dispose();
      // the tab may be closing or the window reloading; either way this pty has no viewer
      void invoke("terminal_close", { id: pty }).catch(() => {});
    };
  }, [id, projectId, hasFolder]);

  if (!hasFolder) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center px-6 text-center text-[12px]"
        style={{ display: hidden ? "none" : undefined, color: "var(--text-muted)" }}
      >
        This project has no project folder yet. Settings → Projects → Project folder.
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col" style={{ display: hidden ? "none" : undefined }}>
      {note && (
        <div className="px-2 py-1 text-[11px]" style={{ color: "var(--amber)" }}>
          {note}
        </div>
      )}
      <div ref={host} className="min-h-0 flex-1 px-1" />
    </div>
  );
}

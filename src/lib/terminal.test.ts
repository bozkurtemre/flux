import { describe, expect, it } from "vitest";
import capability from "../../src-tauri/capabilities/default.json";
import { killTabCommand, openCommand, pasteSequence, quitAction, sessionName } from "./terminal";
import { DEFAULTS, type TerminalSettings } from "./settings";

// these are tmux's own commands, and tmux is no longer the default engine, so the base
// here asks for it and a test about the shell says so
const t = (over: Partial<TerminalSettings> = {}): TerminalSettings => ({ ...DEFAULTS.terminal, engine: "tmux", ...over });
const open = (over: Partial<TerminalSettings> = {}, folder = "/src/api") => openCommand({ settings: t(over), projectId: "p1", tabId: "t1", folder });

describe("session naming", () => {
  it("names a session after its project, with tmux's own separators kept out", () => {
    // `.` and `:` divide a tmux target into session:window.pane, so they can never be in a name
    expect(sessionName("8a1f")).toBe("flux-8a1f");
    expect(sessionName("a.b:c")).toBe("flux-a-b-c");
  });
});

describe("opening a terminal tab", () => {
  it("creates the project's session once, then the tab's own window inside it", () => {
    // verified against tmux 3.7: the base session holds the windows and is never attached,
    // each tab attaches through a grouped session so two tabs are not the same view
    expect(open().args[2]).toBe(
      "tmux has-session -t '=flux-p1' 2>/dev/null || tmux new-session -d -s 'flux-p1' -n 't1' -c '/src/api'; " +
        "exec tmux new-session -t '=flux-p1' -c '/src/api' \\; set-option destroy-unattached on \\; new-window -S -n 't1' -c '/src/api'",
    );
  });

  it("runs it through a login shell, in the project folder", () => {
    const cmd = open();
    expect(cmd.program).toBe(""); // empty means the backend's own login shell
    expect(cmd.args.slice(0, 2)).toEqual(["-l", "-c"]);
    expect(cmd.cwd).toBe("/src/api");
  });

  it("puts a second tab in the same session under a different window", () => {
    const second = openCommand({ settings: t(), projectId: "p1", tabId: "t2", folder: "/src/api" });
    expect(second.args[2]).toContain("'=flux-p1'");
    expect(second.args[2]).toContain("-n 't2'");
    expect(second.args[2]).not.toContain("-n 't1'");
  });

  it("survives a folder with a space or a quote in it", () => {
    expect(open({}, "/Users/me/my repo").args[2]).toContain("-c '/Users/me/my repo'");
    expect(open({}, "/tmp/it's here").args[2]).toContain("-c '/tmp/it'\\''s here'");
  });

  it("uses the configured tmux binary and shell when they are set", () => {
    const cmd = open({ tmuxPath: "/opt/homebrew/bin/tmux", shell: "/bin/zsh" });
    expect(cmd.program).toBe("/bin/zsh");
    expect(cmd.args[2].startsWith("/opt/homebrew/bin/tmux has-session")).toBe(true);
  });

  it("falls back to a plain login shell when tmux is turned off", () => {
    const cmd = open({ engine: "shell" });
    expect(cmd.args).toEqual(["-l"]);
    expect(cmd.cwd).toBe("/src/api");
  });
});

describe("closing a terminal tab", () => {
  it("kills exactly that tab's window, which drops the session once it was the last one", () => {
    expect(killTabCommand(t(), "p1", "t1")?.args[2]).toBe("tmux kill-window -t '=flux-p1:=t1'");
  });

  it("has nothing to kill when tmux is off, because the shell dies with the tab", () => {
    expect(killTabCommand(t({ engine: "shell" }), "p1", "t1")).toBeNull();
  });
});

describe("quitting with sessions open", () => {
  it("asks only when there is something to ask about", () => {
    expect(quitAction("ask", 2, true)).toBe("ask");
    expect(quitAction("ask", 0, true)).toBe("leave");
  });

  it("honours a remembered answer without asking again", () => {
    expect(quitAction("kill", 2, true)).toBe("kill");
    expect(quitAction("leave", 2, true)).toBe("leave");
    expect(quitAction("kill", 0, true)).toBe("leave");
  });

  it("does not offer to keep sessions that cannot survive the app anyway", () => {
    // without tmux the shells die with the process, so both answers mean the same thing
    expect(quitAction("ask", 3, false)).toBe("leave");
    expect(quitAction("kill", 3, false)).toBe("leave");
  });
});

describe("handing text to a terminal", () => {
  it("wraps it as a paste, so nothing is entered", () => {
    const seq = pasteSequence('{"level":"ERROR"}');
    expect(seq.startsWith("\x1b[200~")).toBe(true);
    expect(seq.endsWith("\x1b[201~")).toBe(true);
    expect(seq).not.toContain("\n");
    expect(seq).not.toContain("\r");
  });

  it("leaves no line for a program that ignores the markers to run", () => {
    expect(pasteSequence("one\ntwo\r\nthree")).toBe("\x1b[200~one two three\x1b[201~");
  });
});

describe("the permission the quit flow depends on", () => {
  it("grants the window the right to close itself", () => {
    // the prompt answers by destroying the window; without this in the capability the call
    // is refused by the ACL and the app simply refuses to quit, silently
    expect(capability.permissions).toContain("core:window:allow-destroy");
  });
});

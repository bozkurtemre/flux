// What a terminal tab starts, and what closing one ends. Every decision the feature makes
// lives here as a pure function: the Rust side only runs what this hands it, which is what
// keeps the feature testable without a pseudo-terminal or a running tmux.
import type { OnQuit, TerminalSettings } from "./settings";

export interface ShellCommand {
  /** Empty means the login shell of whoever is running the app, resolved by the backend. */
  program: string;
  args: string[];
}

export interface TerminalCommand extends ShellCommand {
  cwd: string;
}

/** Single-quote for the login shell, the one form that survives spaces, quotes and $. */
const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/** `.` and `:` separate a tmux target into session:window.pane, so a name cannot hold them. */
const safe = (s: string) => s.replace(/[.:\s]/g, "-");

/**
 * Text handed to a terminal the way ⌘V hands it over: wrapped in the bracketed-paste markers,
 * which tell whatever is reading — a shell, Claude Code — that this is text being pasted and
 * not a line being entered. There is no newline in it, so nothing runs; the flattening is for
 * a program that does not understand the markers, which would otherwise see one Enter per
 * line.
 */
export function pasteSequence(text: string): string {
  return `\x1b[200~${text.replace(/\r?\n/g, " ")}\x1b[201~`;
}

export const sessionName = (projectId: string) => `flux-${safe(projectId)}`;

/**
 * A tab's window inside its project's session. The base session is created detached and
 * never attached to; each tab attaches through a grouped session of its own, which is what
 * lets two tabs on one project show different windows instead of mirroring each other. The
 * group dies with its last window, so closing every tab leaves nothing behind.
 */
export function openCommand({
  settings,
  projectId,
  tabId,
  folder,
}: {
  settings: TerminalSettings;
  projectId: string;
  tabId: string;
  folder: string;
}): TerminalCommand {
  const program = settings.shell.trim();
  if (settings.engine !== "tmux") return { program, args: ["-l"], cwd: folder };

  const tmux = settings.tmuxPath.trim() || "tmux";
  const session = sessionName(projectId);
  const window = safe(tabId);
  const dir = q(folder);
  const script =
    `${tmux} has-session -t ${q(`=${session}`)} 2>/dev/null || ` +
    `${tmux} new-session -d -s ${q(session)} -n ${q(window)} -c ${dir}; ` +
    `exec ${tmux} new-session -t ${q(`=${session}`)} -c ${dir} \\; ` +
    `set-option destroy-unattached on \\; new-window -S -n ${q(window)} -c ${dir}`;
  return { program, args: ["-l", "-c", script], cwd: folder };
}

/** Null when there is no tmux to talk to: the shell dies with the pseudo-terminal anyway. */
export function killTabCommand(settings: TerminalSettings, projectId: string, tabId: string): ShellCommand | null {
  if (settings.engine !== "tmux") return null;
  const tmux = settings.tmuxPath.trim() || "tmux";
  const target = q(`=${sessionName(projectId)}:=${safe(tabId)}`);
  return { program: settings.shell.trim(), args: ["-l", "-c", `${tmux} kill-window -t ${target}`] };
}

/**
 * Nothing running means nothing to decide, and neither does a terminal that cannot outlive
 * the app: without tmux the shells die with the process either way, so asking would be
 * offering a choice that does not exist.
 */
export const quitAction = (onQuit: OnQuit, liveTabs: number, persists: boolean): OnQuit => (liveTabs === 0 || !persists ? "leave" : onQuit);

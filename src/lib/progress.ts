// Work the window is doing on your behalf, and what it has to say when it goes wrong. The
// shapes and the two decisions about them live here; the screen only draws them.

/** Something running in the background. Without a progress it is drawn as indeterminate. */
export interface Task {
  id: string;
  title: string;
  /** 0 to 1, when the work knows how much of it is left. */
  progress?: number;
  /** Present only when the work can actually be stopped, so the button is never a decoration. */
  cancel?: () => void;
}

export type NoticeKind = "error" | "warning" | "info";

/** One balloon: what happened, in the words of whatever it happened to. */
export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  message: string;
}

/** The status bar has room for one: the newest, which is the one you just caused. */
export const visibleTask = (tasks: Task[]): Task | undefined => tasks[tasks.length - 1];

/** The others are counted rather than listed, as the IDE does when work piles up. */
export function taskLabel(tasks: Task[]): string {
  const task = visibleTask(tasks);
  if (!task) return "";
  return tasks.length > 1 ? `${task.title} (+${tasks.length - 1})` : task.title;
}

/**
 * The same failure from the same source is one balloon, not a stack of them: a connection
 * that times out while three branches are open would otherwise say so three times.
 */
export function withNotice(list: Notice[], notice: Notice): Notice[] {
  if (list.some((n) => n.kind === notice.kind && n.title === notice.title && n.message === notice.message)) return list;
  return [...list, notice];
}

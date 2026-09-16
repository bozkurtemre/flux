import { describe, expect, it } from "vitest";
import { taskLabel, visibleTask, withNotice, type Notice, type Task } from "./progress";

const task = (id: string, title: string): Task => ({ id, title });
const notice = (title: string, message: string): Notice => ({ id: title + message, kind: "error", title, message });

describe("what the status bar shows", () => {
  it("shows the newest task, because that is the one you just caused", () => {
    expect(visibleTask([task("1", "Connecting to prod"), task("2", "Indexing")])?.title).toBe("Indexing");
    expect(visibleTask([])).toBeUndefined();
  });

  it("counts the rest instead of listing them", () => {
    expect(taskLabel([task("1", "Indexing")])).toBe("Indexing");
    expect(taskLabel([task("1", "Connecting to prod"), task("2", "Indexing")])).toBe("Indexing (+1)");
    expect(taskLabel([])).toBe("");
  });
});

describe("what the balloons show", () => {
  it("says the same thing once", () => {
    // three open branches against one dead connection is one timeout, not three
    const first = withNotice([], notice("prod", "Operation timed out."));
    const again = withNotice(first, notice("prod", "Operation timed out."));
    expect(again).toHaveLength(1);
    expect(again).toBe(first);
  });

  it("keeps a different failure from the same source", () => {
    const list = withNotice(withNotice([], notice("prod", "Operation timed out.")), notice("prod", "401 Unauthorized"));
    expect(list.map((n) => n.message)).toEqual(["Operation timed out.", "401 Unauthorized"]);
  });
});

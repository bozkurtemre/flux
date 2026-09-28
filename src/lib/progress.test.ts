import { describe, expect, it } from "vitest";
import { errorText, failureReason, taskLabel, type Notice, type Task, visibleTask, withNotice, worstOf } from "./progress";

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

describe("what a failure says", () => {
  it("reads whatever was thrown, including the plain strings Tauri rejects with", () => {
    // the bug this guards: a balloon with a connection name and an empty line under it
    expect(errorText("error sending request for url (https://graylog/api/streams)")).toContain("error sending request");
    expect(errorText(new Error("401 /api/streams: token"))).toBe("401 /api/streams: token");
    expect(errorText(new Error(" "))).toBe("No reason given.");
    expect(errorText(undefined)).toBe("No reason given.");
  });

  it("says what went wrong rather than how the request was wrapped", () => {
    expect(failureReason("error sending request for url (https://x): tcp connect error: Operation timed out (os error 60)")).toBe(
      "Operation timed out.",
    );
    expect(failureReason("tcp connect error: Connection refused (os error 61)")).toBe("Connection refused.");
    expect(failureReason(new Error("401 /api/streams: invalid token"))).toBe("The access token was rejected.");
    expect(failureReason("dns error: failed to lookup address information")).toBe("The host name could not be resolved.");
  });

  it("passes an unfamiliar failure through untouched", () => {
    expect(failureReason("the stream was deleted while we read it")).toBe("the stream was deleted while we read it");
  });
});

describe("what the stripe's dot says", () => {
  const n = (kind: "error" | "warning" | "info") => ({ id: kind, kind, title: "t", message: "m" });

  it("takes the worst of what is waiting", () => {
    expect(worstOf([n("info"), n("warning")])).toBe("warning");
    expect(worstOf([n("warning"), n("error")])).toBe("error");
    expect(worstOf([n("info")])).toBe("info");
  });

  it("says nothing when nothing is waiting", () => {
    expect(worstOf([])).toBeNull();
  });
});

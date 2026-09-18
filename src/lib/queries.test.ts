import { describe, expect, it } from "vitest";
import { nameFor, remember, unsaved, upsert, type SavedQuery } from "./queries";

const query = (over: Partial<SavedQuery> = {}): SavedQuery => ({
  id: "q1",
  name: "Errors",
  query: "level:ERROR",
  connId: "c1",
  streamIds: ["s1"],
  streamLabel: "payments",
  rangeSeconds: 3600,
  savedAt: 1,
  ...over,
});

describe("naming a query nobody named", () => {
  it("takes the first line that says something", () => {
    expect(nameFor("\n\n  level:ERROR AND source:api  ")).toBe("level:ERROR AND source:api");
  });

  it("shortens a line too long for the panel", () => {
    expect(nameFor("x".repeat(80))).toHaveLength(48);
    expect(nameFor("x".repeat(80)).endsWith("…")).toBe(true);
  });

  it("falls back when there is nothing to go on", () => {
    expect(nameFor("   \n  ", "payments")).toBe("payments");
  });
});

describe("the dot beside a tab", () => {
  it("appears once a saved query has been edited", () => {
    expect(unsaved({ query: "level:ERROR", savedQueryId: "q1" }, [query()])).toBe(false);
    expect(unsaved({ query: "level:WARN", savedQueryId: "q1" }, [query()])).toBe(true);
  });

  it("stays away from a tab that came from nowhere", () => {
    expect(unsaved({ query: "level:WARN" }, [query()])).toBe(false);
  });

  it("stays away when the query it came from has been deleted", () => {
    expect(unsaved({ query: "level:WARN", savedQueryId: "gone" }, [query()])).toBe(false);
  });
});

describe("keeping the list", () => {
  it("puts something new at the top", () => {
    expect(upsert([query()], query({ id: "q2" })).map((q) => q.id)).toEqual(["q2", "q1"]);
  });

  it("replaces a query where it stands rather than repeating it", () => {
    const list = upsert([query({ id: "q0" }), query()], query({ query: "level:WARN" }));
    expect(list.map((q) => q.id)).toEqual(["q0", "q1"]);
    expect(list[1].query).toBe("level:WARN");
  });
});

describe("what was run before", () => {
  const ran = (query: string, streamLabel = "payments") => ({ query, streamLabel });

  it("puts the newest first and does not repeat itself", () => {
    const one = remember([], ran("level:ERROR"));
    const two = remember(one, ran("level:WARN"));
    const again = remember(two, ran("level:ERROR"));
    expect(again.map((h) => h.query)).toEqual(["level:ERROR", "level:WARN"]);
  });

  it("tells the same query on another stream apart", () => {
    const list = remember(remember([], ran("level:ERROR", "payments")), ran("level:ERROR", "orders"));
    expect(list).toHaveLength(2);
  });

  it("keeps an afternoon, not a career", () => {
    let list: { query: string; streamLabel: string }[] = [];
    for (let i = 0; i < 150; i++) list = remember(list, ran(`q${i}`));
    expect(list).toHaveLength(100);
    expect(list[0].query).toBe("q149");
  });
});

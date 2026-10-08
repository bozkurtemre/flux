import { describe, expect, it } from "vitest";
import { makeBundle, mergeBundle, readBundle } from "./bundle";
import { DEFAULTS, type Settings } from "./settings";

const mine: Settings = {
  ...DEFAULTS,
  connections: [
    { id: "c-prod", name: "prod", kind: "graylog", url: "https://graylog.example/", token: "secret-prod" },
    { id: "c-stage", name: "stage", kind: "graylog", url: "https://stage.example", token: "secret-stage" },
  ],
  projects: [
    { id: "p1", connectionId: "c-prod", name: "Wallet", streams: ["s1", "s2"], github: "acme/wallet" },
    { id: "p2", connectionId: "c-stage", name: "Orders", streams: ["s9"] },
  ],
};

describe("a set-up to hand over", () => {
  it("carries the chosen projects and the connections they stand on", () => {
    const b = makeBundle(mine, ["p1"]);
    expect(b.projects.map((p) => p.name)).toEqual(["Wallet"]);
    expect(b.connections.map((c) => c.name)).toEqual(["prod"]);
  });

  it("never carries a token", () => {
    const text = JSON.stringify(makeBundle(mine, ["p1", "p2"]));
    expect(text).not.toContain("secret-prod");
    expect(text).not.toContain("secret-stage");
    expect(text).not.toContain("token");
  });

  it("reads back what it wrote, and nothing else", () => {
    expect(readBundle(JSON.stringify(makeBundle(mine, ["p1"])))?.projects).toHaveLength(1);
    expect(readBundle("{}")).toBeNull();
    expect(readBundle("not json")).toBeNull();
    expect(readBundle(JSON.stringify({ flux: 1, connections: [{}], projects: [] }))).toBeNull();
  });
});

describe("taking a set-up in", () => {
  const counter = () => {
    let n = 0;
    return () => `new-${++n}`;
  };
  const fresh: Settings = { ...DEFAULTS, connections: [], projects: [] };

  it("arrives on a new install with connections waiting for a token", () => {
    const m = mergeBundle(fresh, makeBundle(mine, ["p1", "p2"]), counter());
    expect(m.connectionsAdded).toBe(2);
    expect(m.projectsAdded).toBe(2);
    expect(m.needToken.map((c) => c.name)).toEqual(["prod", "stage"]);
    expect(m.settings.connections.every((c) => c.token === "")).toBe(true);
    // projects point at the connections made here, not at the ids of the machine they left
    const wallet = m.settings.projects.find((p) => p.name === "Wallet");
    expect(wallet?.connectionId).toBe(m.settings.connections.find((c) => c.name === "prod")?.id);
  });

  it("knows a Graylog it already has by its URL, whatever it was called there", () => {
    const here: Settings = {
      ...fresh,
      connections: [{ id: "mine", name: "production", kind: "graylog", url: "https://GRAYLOG.example", token: "t" }],
    };
    const m = mergeBundle(here, makeBundle(mine, ["p1"]), counter());
    expect(m.connectionsAdded).toBe(0);
    expect(m.needToken).toEqual([]);
    expect(m.settings.projects[0].connectionId).toBe("mine");
  });

  it("grows a project it already has instead of adding it twice", () => {
    const here: Settings = {
      ...fresh,
      connections: [{ id: "mine", name: "prod", kind: "graylog", url: "https://graylog.example", token: "t" }],
      projects: [{ id: "x", connectionId: "mine", name: "wallet", streams: ["s1"] }],
    };
    const m = mergeBundle(here, makeBundle(mine, ["p1"]), counter());
    expect(m.projectsAdded).toBe(0);
    expect(m.projectsGrown).toBe(1);
    expect(m.settings.projects).toHaveLength(1);
    expect(m.settings.projects[0].streams).toEqual(["s1", "s2"]);
  });

  it("changes nothing when the file has nothing new", () => {
    const m = mergeBundle(mine, makeBundle(mine, ["p1", "p2"]), counter());
    expect(m.connectionsAdded + m.projectsAdded + m.projectsGrown).toBe(0);
    expect(m.settings.connections).toHaveLength(2);
  });
});

describe("the team's saved queries, in the same file", () => {
  const saved = [
    {
      id: "q1",
      name: "Wallet errors",
      query: "level:ERROR",
      connId: "c-prod",
      streamIds: ["s1"],
      streamLabel: "wallet",
      rangeSeconds: 3600,
      savedAt: 1,
      watch: true,
    },
    // searches a stream that is not being handed over
    { id: "q2", name: "Elsewhere", query: "*", connId: "c-prod", streamIds: ["s1", "s99"], streamLabel: "x", rangeSeconds: 60, savedAt: 1 },
    { id: "q3", name: "Orders", query: "*", connId: "c-stage", streamIds: ["s9"], streamLabel: "orders", rangeSeconds: 60, savedAt: 1 },
  ];

  it("carries the ones that search only the projects handed over", () => {
    expect(makeBundle(mine, ["p1"], new Date(), saved).queries?.map((q) => q.name)).toEqual(["Wallet errors"]);
  });

  it("leaves out what is about one person's machine, like whether it is watched", () => {
    expect(JSON.stringify(makeBundle(mine, ["p1"], new Date(), saved))).not.toContain("watch");
  });

  it("says nothing about queries when there are none to carry", () => {
    expect(makeBundle(mine, ["p1"]).queries).toBeUndefined();
  });

  it("arrives on the connection made here, once", () => {
    const fresh: Settings = { ...DEFAULTS, connections: [], projects: [] };
    let n = 0;
    const m = mergeBundle(fresh, makeBundle(mine, ["p1", "p2"], new Date(), saved), () => `new-${++n}`, [], 7);
    expect(m.queries.map((q) => q.name)).toEqual(["Wallet errors", "Orders"]);
    expect(m.queries[0].connId).toBe(m.settings.connections.find((c) => c.name === "prod")?.id);
    expect(m.queries[0].savedAt).toBe(7);
  });

  it("does not add one that is already here", () => {
    const here = [{ ...saved[0], id: "mine" }];
    const m = mergeBundle(mine, makeBundle(mine, ["p1"], new Date(), saved), () => "x", here);
    expect(m.queries).toEqual([]);
  });

  it("refuses a file whose queries are not queries", () => {
    const bad = { ...makeBundle(mine, ["p1"]), queries: [{ name: 1 }] };
    expect(readBundle(JSON.stringify(bad))).toBeNull();
  });
});

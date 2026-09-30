import { describe, expect, it } from "vitest";
import { makeBundle, mergeBundle, readBundle } from "./bundle";
import { DEFAULTS, type Settings } from "./settings";

const mine: Settings = {
  ...DEFAULTS,
  connections: [
    { id: "c-prod", name: "prod", graylogUrl: "https://graylog.example/", graylogToken: "secret-prod" },
    { id: "c-stage", name: "stage", graylogUrl: "https://stage.example", graylogToken: "secret-stage" },
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
    expect(text).not.toContain("graylogToken");
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
    expect(m.settings.connections.every((c) => c.graylogToken === "")).toBe(true);
    // projects point at the connections made here, not at the ids of the machine they left
    const wallet = m.settings.projects.find((p) => p.name === "Wallet");
    expect(wallet?.connectionId).toBe(m.settings.connections.find((c) => c.name === "prod")?.id);
  });

  it("knows a Graylog it already has by its URL, whatever it was called there", () => {
    const here: Settings = {
      ...fresh,
      connections: [{ id: "mine", name: "production", graylogUrl: "https://GRAYLOG.example", graylogToken: "t" }],
    };
    const m = mergeBundle(here, makeBundle(mine, ["p1"]), counter());
    expect(m.connectionsAdded).toBe(0);
    expect(m.needToken).toEqual([]);
    expect(m.settings.projects[0].connectionId).toBe("mine");
  });

  it("grows a project it already has instead of adding it twice", () => {
    const here: Settings = {
      ...fresh,
      connections: [{ id: "mine", name: "prod", graylogUrl: "https://graylog.example", graylogToken: "t" }],
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

// The tokens' way into and out of the keychain, against an in-memory keychain and in-memory
// settings files: each `launch()` is a fresh module, as a fresh start of Flux is.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Connection } from "./settings";

const files = new Map<string, Map<string, unknown>>();
const keychain = new Map<string, string>();
const refuse = { set: false, get: false };

vi.mock("@tauri-apps/plugin-store", () => ({
  load: async (name: string) => {
    if (!files.has(name)) files.set(name, new Map());
    const f = files.get(name)!;
    return {
      get: async (k: string) => structuredClone(f.get(k)),
      set: async (k: string, v: unknown) => void f.set(k, structuredClone(v)),
      save: async () => {},
    };
  },
}));

vi.mock("./secrets", () => ({
  getSecret: async (id: string) => {
    if (refuse.get) throw new Error("denied");
    return keychain.get(id) ?? null;
  },
  setSecret: async (id: string, secret: string) => {
    if (refuse.set) throw new Error("denied");
    keychain.set(id, secret);
  },
  deleteSecret: async (id: string) => void keychain.delete(id),
}));

const launch = async () => {
  vi.resetModules();
  return import("./settings");
};
const filed = () => files.get("connections.json")?.get("connections") as Connection[];
const prod = (token: string, over: Partial<Connection> = {}): Connection => ({
  id: "c1",
  name: "prod",
  kind: "graylog",
  url: "https://graylog.example",
  token,
  ...over,
});

beforeEach(() => {
  files.clear();
  keychain.clear();
  refuse.set = refuse.get = false;
});

describe("a connection's token in the keychain", () => {
  it("moves out of connections.json on the first launch, and comes back from the keychain on the next", async () => {
    files.set("connections.json", new Map<string, unknown>([["connections", [prod("t-1")]]]));
    const first = await (await launch()).loadSettings();
    expect(first.connections[0].token).toBe("t-1");
    expect(keychain.get("c1")).toBe("t-1");
    expect(filed()[0]).toMatchObject({ token: "", secretStorage: "keychain" });

    const next = await (await launch()).loadSettings();
    expect(next.connections[0].token).toBe("t-1");
  });

  it("stays in the file when the keychain refuses it, and moves once it no longer does", async () => {
    files.set("connections.json", new Map<string, unknown>([["connections", [prod("t-1")]]]));
    refuse.set = true;
    await (await launch()).loadSettings();
    expect(keychain.size).toBe(0);
    expect(filed()[0].token).toBe("t-1");

    refuse.set = false;
    await (await launch()).loadSettings();
    expect(keychain.get("c1")).toBe("t-1");
    expect(filed()[0].token).toBe("");
  });

  it("is replaced when it changes, and removed when the connection loses it or goes", async () => {
    files.set("connections.json", new Map<string, unknown>([["connections", [prod("t-1")]]]));
    const settings = await launch();
    const loaded = await settings.loadSettings();
    await settings.saveSettings({ ...loaded, connections: [prod("t-2")] });
    expect(keychain.get("c1")).toBe("t-2");
    await settings.saveSettings({ ...loaded, connections: [prod("")] });
    expect(keychain.has("c1")).toBe(false);
    expect(filed()[0].secretStorage).toBeUndefined();

    await settings.saveSettings({ ...loaded, connections: [prod("t-3")] });
    await settings.forgetSecrets([prod("t-3")]);
    expect(keychain.has("c1")).toBe(false);
  });

  it("is not taken for removed when the keychain could not be read at launch", async () => {
    files.set("connections.json", new Map<string, unknown>([["connections", [prod("", { secretStorage: "keychain" })]]]));
    keychain.set("c1", "t-1");
    refuse.get = true;
    const settings = await launch();
    const loaded = await settings.loadSettings();
    expect(loaded.connections[0].token).toBe("");
    await settings.saveSettings(loaded);
    expect(keychain.get("c1")).toBe("t-1");
    expect(filed()[0].secretStorage).toBe("keychain");
  });
});

describe("what a save asks of the keychain", () => {
  it("stores what it does not hold, removes what is gone, and otherwise does nothing", async () => {
    const { keychainStep } = await launch();
    expect(keychainStep({ token: "t" }, undefined)).toBe("set");
    expect(keychainStep({ token: "t" }, "old")).toBe("set");
    expect(keychainStep({ token: "t" }, "t")).toBeNull();
    expect(keychainStep({ token: "" }, "t")).toBe("delete");
    expect(keychainStep({ token: "" }, undefined)).toBeNull();
  });
});

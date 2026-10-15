import { describe, expect, it } from "vitest";
import { clientConfig, findConnection, runTool, TOOLS, type ToolContext } from "./mcp";
import type { SavedQuery } from "./queries";
import type { DataSource } from "./datasource";
import type { Connection } from "./settings";

const connection = (over: Partial<Connection> = {}): Connection => ({
  id: "11111111-1111-1111-1111-111111111111",
  name: "prod",
  kind: "graylog",
  url: "https://graylog.example",
  token: "a-secret-token",
  ...over,
});

const context = (client: Partial<DataSource> = {}): ToolContext => ({
  connections: [connection()],
  clientFor: () => client as DataSource,
  defaults: { minutes: 60, limit: 200 },
});

describe("the tools an agent is offered", () => {
  it("names every tool and says what each one needs", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      "list_connections",
      "list_streams",
      "search_logs",
      "count_logs",
      "list_endpoints",
      "current_view",
      "open_query",
      "save_query",
    ]);
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
    }
  });
});

describe("finding the connection an agent named", () => {
  const connections = [connection(), connection({ id: "22222222-2222-2222-2222-222222222222", name: "stage" })];

  it("takes a name or an id, whichever was to hand", () => {
    expect(findConnection(connections, "stage")?.name).toBe("stage");
    expect(findConnection(connections, "11111111-1111-1111-1111-111111111111")?.name).toBe("prod");
    expect(findConnection(connections, "STAGE")?.name).toBe("stage");
  });

  it("finds nothing rather than guessing", () => {
    expect(findConnection(connections, "production")).toBeUndefined();
  });
});

describe("answering a call", () => {
  it("lists connections without their tokens", async () => {
    const result = await runTool("list_connections", {}, context());
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).not.toContain("a-secret-token");
    expect(JSON.parse(result.content[0].text)).toEqual([
      { id: "11111111-1111-1111-1111-111111111111", name: "prod", kind: "graylog", url: "https://graylog.example" },
    ]);
  });

  it("says which connection it could not find, and what to ask instead", async () => {
    const result = await runTool("list_streams", { connection: "nope" }, context());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("list_connections");
  });

  it("searches every stream when it is not told which", async () => {
    let asked: { streams: string[]; size: number } | undefined;
    const ctx = context({
      streams: async () => [{ id: "s1", title: "one" }] as never,
      messages: async (o: never) => {
        asked = o as unknown as { streams: string[]; size: number };
        return { columns: [], rows: [{ message: "hello" }] } as never;
      },
    });
    const result = await runTool("search_logs", { connection: "prod" }, ctx);
    expect(asked?.streams).toEqual(["s1"]);
    expect(asked?.size).toBe(200);
    expect(JSON.parse(result.content[0].text).messages).toEqual([{ message: "hello" }]);
  });

  it("hands back the reason when Graylog refuses, rather than throwing at the server", async () => {
    const ctx = context({
      streams: async () => {
        throw new Error("401 /api/streams: token rejected");
      },
    });
    const result = await runTool("list_streams", { connection: "prod" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("401");
  });

  it("refuses a tool it does not have", async () => {
    const result = await runTool("drop_database", { connection: "prod" }, context());
    expect(result.isError).toBe(true);
  });
});

describe("what a client is told", () => {
  it("names the loopback address and carries the token in a header", () => {
    const { url, json, cli } = clientConfig(4319, "t0ken");
    expect(url).toBe("http://127.0.0.1:4319/mcp");
    expect(JSON.parse(json).mcpServers.flux).toEqual({
      type: "http",
      url,
      headers: { Authorization: "Bearer t0ken" },
    });
    expect(cli).toContain("--transport http");
    expect(cli).toContain("Bearer t0ken");
  });
});

describe("the window, from the agent's side", () => {
  it("says what the person is looking at, selected row and all", async () => {
    const view = {
      connection: "prod",
      streams: [{ id: "s1", title: "payments" }],
      query: "level:ERROR",
      minutes: 60,
      columns: ["timestamp", "message"],
      rowsOnScreen: 12,
      selected: { message: "boom" },
    };
    const result = await runTool("current_view", {}, { ...context(), view: () => view });
    expect(JSON.parse(result.content[0].text)).toEqual(view);
  });

  it("says so when there is nothing open, rather than making something up", async () => {
    const result = await runTool("current_view", {}, { ...context(), view: () => null });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("open_query");
  });

  it("opens a console in the window on the connection it names", async () => {
    let opened: unknown;
    const result = await runTool(
      "open_query",
      { connection: "prod", stream: "s1", query: "level:ERROR | patterns", minutes: 30 },
      { ...context(), open: (o) => (opened = o) },
    );
    expect(result.isError).toBeUndefined();
    expect(opened).toEqual({ connId: "11111111-1111-1111-1111-111111111111", streamId: "s1", query: "level:ERROR | patterns", minutes: 30 });
  });

  it("will not open one on a connection it does not have", async () => {
    let opened = false;
    const result = await runTool("open_query", { connection: "nope", stream: "s1", query: "*" }, { ...context(), open: () => (opened = true) });
    expect(result.isError).toBe(true);
    expect(opened).toBe(false);
  });
});

describe("saving a query to watch", () => {
  const streams = async () => [
    { id: "s-pay", title: "payments", description: "", disabled: false },
    { id: "s-gw", title: "gateway", description: "", disabled: false },
  ];
  const saving = (savedQueries: SavedQuery[] = []) => {
    const kept: SavedQuery[] = [];
    const ctx: ToolContext = { ...context({ streams }), savedQueries, save: (e) => kept.push(e) };
    return { ctx, kept };
  };

  it("keeps the query watched, on the streams it names, by their titles", async () => {
    const { ctx, kept } = saving();
    const result = await runTool("save_query", { connection: "prod", streams: ["s-pay"], query: "level:ERROR AND route:/v1/charges" }, ctx);
    expect(result.isError).toBeUndefined();
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      name: "level:ERROR AND route:/v1/charges",
      connId: "11111111-1111-1111-1111-111111111111",
      streamIds: ["s-pay"],
      streamLabel: "payments",
      rangeSeconds: 3600,
      watch: true,
    });
    expect(kept[0].watchSeconds).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toMatchObject({ saved: "level:ERROR AND route:/v1/charges", updated: false });
  });

  it("names it, watches it for silence and keeps the interval inside its bounds", async () => {
    const { ctx, kept } = saving();
    await runTool(
      "save_query",
      { connection: "prod", streams: ["s-gw"], query: "route:/v1/webhook", name: "  Webhook  ", every: 2, quiet_below: 1.7 },
      ctx,
    );
    expect(kept[0]).toMatchObject({ name: "Webhook", watchSeconds: 15, quietBelow: 1 });
    await runTool("save_query", { connection: "prod", streams: ["s-gw"], query: "x", every: 86_400 }, ctx);
    expect(kept[1].watchSeconds).toBe(3600);
  });

  it("can save without watching", async () => {
    const { ctx, kept } = saving();
    await runTool("save_query", { connection: "prod", streams: ["s-pay"], query: "level:WARN", watch: false }, ctx);
    expect(kept[0].watch).toBe(false);
  });

  it("updates the same query on the same streams instead of adding a second", async () => {
    const before: SavedQuery = {
      id: "q-1",
      name: "Charge errors",
      query: "level:ERROR",
      connId: "11111111-1111-1111-1111-111111111111",
      streamIds: ["s-pay", "s-gw"],
      streamLabel: "payments, gateway",
      rangeSeconds: 3600,
      savedAt: 1,
      watch: false,
      level: "error",
    };
    const { ctx, kept } = saving([before]);
    const result = await runTool("save_query", { connection: "prod", streams: ["s-gw", "s-pay"], query: " level:ERROR " }, ctx);
    expect(kept[0]).toMatchObject({ id: "q-1", name: "Charge errors", watch: true, level: "error" });
    expect(JSON.parse(result.content[0].text).updated).toBe(true);
  });

  it("refuses what cannot be watched, before keeping anything", async () => {
    const { ctx, kept } = saving();
    const unknown = await runTool("save_query", { connection: "prod", streams: ["s-nope"], query: "level:ERROR" }, ctx);
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0].text).toContain("s-nope");
    const fixed = await runTool(
      "save_query",
      { connection: "prod", streams: ["s-pay"], query: "level:ERROR | between 2026-10-14T10:00:00Z and 2026-10-14T11:00:00Z" },
      ctx,
    );
    expect(fixed.isError).toBe(true);
    const empty = await runTool("save_query", { connection: "prod", streams: [], query: "level:ERROR" }, ctx);
    expect(empty.isError).toBe(true);
    expect(kept).toHaveLength(0);
  });

  it("says so when this Flux cannot save", async () => {
    const result = await runTool("save_query", { connection: "prod", streams: ["s-pay"], query: "level:ERROR" }, context({ streams }));
    expect(result.isError).toBe(true);
  });
});

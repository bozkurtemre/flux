import { describe, expect, it } from "vitest";
import { clientConfig, findConnection, runTool, TOOLS, type ToolContext } from "./mcp";
import type { Graylog } from "./graylog";
import type { Connection } from "./settings";

const connection = (over: Partial<Connection> = {}): Connection => ({
  id: "11111111-1111-1111-1111-111111111111",
  name: "prod",
  graylogUrl: "https://graylog.example",
  graylogToken: "a-secret-token",
  ...over,
});

const context = (client: Partial<Graylog> = {}): ToolContext => ({
  connections: [connection()],
  clientFor: () => client as Graylog,
  defaults: { minutes: 60, limit: 200 },
});

describe("the tools an agent is offered", () => {
  it("names every tool and says what each one needs", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["list_connections", "list_streams", "search_logs", "count_logs", "list_endpoints"]);
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
      { id: "11111111-1111-1111-1111-111111111111", name: "prod", url: "https://graylog.example" },
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

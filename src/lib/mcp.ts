// What Flux offers an agent: the same connections, streams and searches the window works
// with, answered as JSON. The tools are defined and run here because this is where Graylog is
// understood — the client, the field mapping, the endpoint derivation — and the server in
// Rust only carries the question and the answer.
import { absolute, type Graylog } from "./graylog";
import { endpointsFromGraylog, sortEndpoints } from "./endpoints";
import type { Connection } from "./settings";

export interface ToolContext {
  connections: Connection[];
  clientFor: (conn: Connection) => Graylog;
  /** How far back a search looks when it is not told, and how many rows it returns. */
  defaults: { minutes: number; limit: number };
}

/** The MCP result shape: content the agent reads, and a flag when it is a failure. */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const text = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

const failure = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

export const TOOLS = [
  {
    name: "list_connections",
    description: "The Graylog connections Flux is set up with. Everything else takes one of these by name or id.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_streams",
    description: "The streams a connection exposes, with their ids. A search takes stream ids.",
    inputSchema: {
      type: "object",
      properties: { connection: { type: "string", description: "Connection name or id" } },
      required: ["connection"],
      additionalProperties: false,
    },
  },
  {
    name: "search_logs",
    description:
      "Search a connection's logs. Lucene query, newest first. Without streams it searches them all; without minutes it looks back an hour.",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "Connection name or id" },
        query: { type: "string", description: "Lucene query, e.g. level:ERROR AND route:/v1/wallet" },
        streams: { type: "array", items: { type: "string" }, description: "Stream ids; all of them when omitted" },
        minutes: { type: "number", description: "How far back to look, in minutes" },
        limit: { type: "number", description: "How many messages to return" },
        fields: { type: "array", items: { type: "string" }, description: "Which fields to return" },
      },
      required: ["connection"],
      additionalProperties: false,
    },
  },
  {
    name: "count_logs",
    description: "How many messages match, without returning them. Cheaper than a search when only the number matters.",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string" },
        query: { type: "string" },
        streams: { type: "array", items: { type: "string" } },
        minutes: { type: "number" },
      },
      required: ["connection"],
      additionalProperties: false,
    },
  },
  {
    name: "list_endpoints",
    description: "The endpoints a stream serves, derived from its logs: request counts, error rates and the 95th percentile of response time.",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string" },
        stream: { type: "string", description: "Stream id" },
        minutes: { type: "number" },
        limit: { type: "number" },
      },
      required: ["connection", "stream"],
      additionalProperties: false,
    },
  },
] as const;

/** What a client needs to reach this server, in the two shapes people paste. */
export function clientConfig(port: number, token: string) {
  const url = `http://127.0.0.1:${port}/mcp`;
  return {
    url,
    json: JSON.stringify({ mcpServers: { flux: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
    cli: `claude mcp add --transport http flux ${url} --header "Authorization: Bearer ${token}"`,
  };
}

/** A connection by id or by name, because an agent will have read the name. */
export function findConnection(connections: Connection[], wanted: string): Connection | undefined {
  const needle = wanted.trim().toLowerCase();
  return connections.find((c) => c.id.toLowerCase() === needle) ?? connections.find((c) => c.name.toLowerCase() === needle);
}

export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  if (name === "list_connections") {
    // the token is never part of an answer, whoever is asking
    return text(ctx.connections.map((c) => ({ id: c.id, name: c.name, url: c.graylogUrl })));
  }

  const conn = findConnection(ctx.connections, String(args.connection ?? ""));
  if (!conn) return failure(`No connection called "${String(args.connection ?? "")}". Ask list_connections first.`);
  const client = ctx.clientFor(conn);
  const minutes = Number(args.minutes) > 0 ? Number(args.minutes) : ctx.defaults.minutes;
  const to = new Date();
  const timerange = absolute(new Date(to.getTime() - minutes * 60_000), to);

  try {
    if (name === "list_streams") {
      const streams = await client.streams();
      return text(streams.map((s) => ({ id: s.id, title: s.title, description: s.description })));
    }

    if (name === "search_logs") {
      const streams = (args.streams as string[] | undefined) ?? (await client.streams()).map((s) => s.id);
      const page = await client.messages({
        query: String(args.query ?? "*") || "*",
        streams,
        timerange,
        fields: (args.fields as string[] | undefined) ?? ["timestamp", "source", "level", "message"],
        size: Number(args.limit) > 0 ? Number(args.limit) : ctx.defaults.limit,
      });
      return text({ connection: conn.name, minutes, rows: page.rows.length, messages: page.rows });
    }

    if (name === "count_logs") {
      const streams = (args.streams as string[] | undefined) ?? (await client.streams()).map((s) => s.id);
      const total = await client.count({ query: String(args.query ?? "*") || "*", streams, timerange });
      return text({ connection: conn.name, minutes, total });
    }

    if (name === "list_endpoints") {
      const stream = String(args.stream ?? "");
      if (!stream) return failure("list_endpoints needs a stream id; ask list_streams first.");
      const fields = await client.fields(stream).catch(() => []);
      const limit = Number(args.limit) > 0 ? Number(args.limit) : 100;
      const rows = await endpointsFromGraylog(client, stream, fields, { lookbackHours: minutes / 60, limit });
      return text({ connection: conn.name, stream, endpoints: sortEndpoints(rows, "traffic").slice(0, limit) });
    }

    return failure(`No such tool: ${name}`);
  } catch (e) {
    return failure(e instanceof Error ? e.message : String(e));
  }
}

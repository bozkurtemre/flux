// What Flux offers an agent: the same connections, streams and searches the window works
// with, answered as JSON. The tools are defined and run here because this is where the sources are
// understood — the adapters, the field mapping, the endpoint derivation — and the server in
// Rust only carries the question and the answer.
import { absolute, type DataSource } from "./datasource";
import { endpointsFrom, sortEndpoints } from "./endpoints";
import { nameFor, type SavedQuery } from "./queries";
import { parseQuery } from "./query";
import type { Connection } from "./settings";

/** What the window is showing, as an agent needs it: enough to ask the same question again. */
export interface View {
  connection: string;
  streams: { id: string; title: string }[];
  query: string;
  /** Either the last this many minutes, or the window the query names. */
  minutes?: number;
  between?: { from: string; to: string };
  columns: string[];
  rowsOnScreen: number;
  /** The row the person has selected, whole, if they have. */
  selected?: Record<string, unknown>;
}

export interface ToolContext {
  connections: Connection[];
  clientFor: (conn: Connection) => DataSource;
  /** How far back a search looks when it is not told, and how many rows it returns. */
  defaults: { minutes: number; limit: number };
  /** The tab in front of the person, if there is one. */
  view?: () => View | null;
  /** Open a console in the window and run it there, for the person to look at. */
  open?: (o: { connId: string; streamId: string; query: string; minutes?: number }) => void;
  /** The person's saved queries, and a way to keep one there: an agent leaves a watch behind. */
  savedQueries?: SavedQuery[];
  save?: (entry: SavedQuery) => void;
}

/** How often an agent's watch may ask: not so often it leans on the source, not so rarely it says nothing. */
export const WATCH_SECONDS = { least: 15, most: 3600 };

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
    description:
      "The connections Flux is set up with, and the kind of source each one is (Graylog, or Elasticsearch through Kibana). Everything else takes one of these by name or id. Searches are Lucene query strings on either kind.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_streams",
    description: "The streams a connection exposes (Kibana data views, on an Elasticsearch connection), with their ids. A search takes stream ids.",
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
  {
    name: "current_view",
    description:
      "What the person is looking at in Flux right now: the connection, the streams, the query and its time range, and the row they have selected, if any. Ask this before asking them to paste anything.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "open_query",
    description:
      "Open a query console in the person's Flux window and run it there, so they can see the result. Use it to show them something, not to read logs yourself — search_logs is for that.",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "Connection name or id" },
        stream: { type: "string", description: "Stream id" },
        query: { type: "string", description: "The console line: Lucene, optionally with | group by, | patterns, | between" },
        minutes: { type: "number", description: "How far back to look, in minutes" },
      },
      required: ["connection", "stream", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "save_query",
    description:
      "Save a query in the person's Flux, watched by default: while Flux is open it is asked every round and new matches are announced on the island and as a notification. Use it to leave a watch behind after a deploy, on the errors the change could bring. Saving the same query on the same streams again updates it instead of adding a second. It writes only to Flux's own list of saved queries, never to the source.",
    inputSchema: {
      type: "object",
      properties: {
        connection: { type: "string", description: "Connection name or id" },
        streams: { type: "array", items: { type: "string" }, description: "Stream ids the query searches; ask list_streams for them" },
        query: { type: "string", description: "Lucene query, e.g. level:ERROR AND route:/v1/charges" },
        name: { type: "string", description: "What the person sees in the Queries panel; the query's first line when omitted" },
        watch: { type: "boolean", description: "Announce new matches while Flux is open; true when omitted" },
        every: { type: "number", description: "How often the watch asks, in seconds, 15 to 3600; Flux's setting when omitted" },
        quiet_below: {
          type: "number",
          description: "Watch for silence instead: announce when fewer than this many arrive in a round, as for a cron or a webhook",
        },
        minutes: { type: "number", description: "How far back the console looks when the person opens the query; an hour when omitted" },
      },
      required: ["connection", "streams", "query"],
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
    return text(ctx.connections.map((c) => ({ id: c.id, name: c.name, kind: c.kind, url: c.url })));
  }

  if (name === "current_view") {
    const view = ctx.view?.();
    return view ? text(view) : failure("No query console is open in Flux. Ask the person to open one, or use open_query.");
  }

  const conn = findConnection(ctx.connections, String(args.connection ?? ""));
  if (!conn) return failure(`No connection called "${String(args.connection ?? "")}". Ask list_connections first.`);
  const client = ctx.clientFor(conn);
  const minutes = Number(args.minutes) > 0 ? Number(args.minutes) : ctx.defaults.minutes;
  const to = new Date();
  const timerange = absolute(new Date(to.getTime() - minutes * 60_000), to);

  if (name === "open_query") {
    const stream = String(args.stream ?? "");
    if (!stream) return failure("open_query needs a stream id; ask list_streams first.");
    if (!ctx.open) return failure("This Flux cannot open a console from here.");
    ctx.open({
      connId: conn.id,
      streamId: stream,
      query: String(args.query ?? ""),
      minutes: Number(args.minutes) > 0 ? Number(args.minutes) : undefined,
    });
    return text(`Opened in Flux on ${conn.name}. The person is looking at it now.`);
  }

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

    if (name === "save_query") return await saveQuery(conn, client, args, ctx, minutes);

    if (name === "list_endpoints") {
      const stream = String(args.stream ?? "");
      if (!stream) return failure("list_endpoints needs a stream id; ask list_streams first.");
      const fields = await client.fields(stream).catch(() => []);
      const limit = Number(args.limit) > 0 ? Number(args.limit) : 100;
      const rows = await endpointsFrom(client, stream, fields, { lookbackHours: minutes / 60, limit });
      return text({ connection: conn.name, stream, endpoints: sortEndpoints(rows, "traffic").slice(0, limit) });
    }

    return failure(`No such tool: ${name}`);
  } catch (e) {
    return failure(e instanceof Error ? e.message : String(e));
  }
}

const sameStreams = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

/** save_query: checked against the source before anything is kept, so a watch is never set on nothing. */
async function saveQuery(
  conn: Connection,
  client: DataSource,
  args: Record<string, unknown>,
  ctx: ToolContext,
  minutes: number,
): Promise<ToolResult> {
  if (!ctx.save) return failure("This Flux cannot save a query from here.");
  const query = String(args.query ?? "").trim();
  if (!query) return failure("save_query needs a query.");
  const ids = [...new Set((Array.isArray(args.streams) ? args.streams : []).map(String).filter(Boolean))];
  if (!ids.length) return failure("save_query needs at least one stream id; ask list_streams first.");
  const watch = args.watch !== false;
  if (watch && parseQuery(query).between) {
    return failure("A query with | between searches a fixed window, which never has anything new to watch. Leave the between clause out.");
  }

  const known = await client.streams();
  const missing = ids.filter((id) => !known.some((s) => s.id === id));
  if (missing.length) return failure(`No stream ${missing.map((id) => `"${id}"`).join(", ")} on ${conn.name}. Ask list_streams first.`);
  const streamLabel = ids.map((id) => known.find((s) => s.id === id)?.title ?? id).join(", ");

  const every = Number(args.every) > 0 ? Math.min(WATCH_SECONDS.most, Math.max(WATCH_SECONDS.least, Math.round(Number(args.every)))) : undefined;
  const quiet = Number(args.quiet_below) >= 1 ? Math.floor(Number(args.quiet_below)) : undefined;
  const existing = ctx.savedQueries?.find((q) => q.connId === conn.id && sameStreams(q.streamIds, ids) && q.query.trim() === query);
  const entry: SavedQuery = {
    id: existing?.id ?? crypto.randomUUID(),
    name:
      String(args.name ?? "")
        .trim()
        .slice(0, 80) ||
      existing?.name ||
      nameFor(query, streamLabel),
    query,
    connId: conn.id,
    streamIds: ids,
    streamLabel,
    rangeSeconds: minutes * 60,
    savedAt: Math.floor(Date.now() / 1000),
    watch,
    ...(every ? { watchSeconds: every } : {}),
    ...(quiet ? { quietBelow: quiet } : {}),
    ...(existing?.level ? { level: existing.level } : {}),
  };
  ctx.save(entry);
  return text({
    saved: entry.name,
    id: entry.id,
    connection: conn.name,
    streams: streamLabel,
    query,
    updated: !!existing,
    watch: !watch
      ? false
      : quiet
        ? `for silence: fewer than ${quiet} in a round, ${every ? `every ${every} seconds` : "as often as Flux's setting says"}`
        : `for new matches, ${every ? `every ${every} seconds` : "as often as Flux's setting says"}`,
    note: watch
      ? "It is in the person's Queries panel. Flux announces matches only while it is open, starting from now."
      : "It is in the person's Queries panel.",
  });
}

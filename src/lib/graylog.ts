// Graylog 5.2, as a data source. The scripting API answers the messages and the grouped counts;
// the views API, which is how Graylog's own interface asks, answers the rest.
import { request, type Bucket, type DataSource, type FieldInfo, type MessagePage, type Metric, type Stream, type TimeRange } from "./datasource";

export class Graylog implements DataSource {
  readonly kind = "graylog" as const;
  private auth: string;

  constructor(
    public url: string,
    token: string,
  ) {
    this.url = url.replace(/\/$/, "");
    // Graylog access tokens authenticate as basic <token>:token
    this.auth = "Basic " + btoa(`${token}:token`);
  }

  private call<T>(path: string, init: RequestInit & { mediaType?: string } = {}): Promise<T> {
    return request<T>(this.url + path, {
      ...init,
      label: path.split("?")[0],
      headers: { Authorization: this.auth, "X-Requested-By": "Flux", ...(init.headers ?? {}) },
    });
  }

  async version(signal?: AbortSignal): Promise<string> {
    const r = await this.call<{ version: string }>("/api/system", { signal });
    return r.version;
  }

  async streams(signal?: AbortSignal): Promise<Stream[]> {
    const r = await this.call<{ streams: Stream[] }>("/api/streams", { signal });
    return r.streams.filter((s) => !s.disabled).sort((a, b) => a.title.localeCompare(b.title));
  }

  async fields(streamId: string, rangeSec = 604800, signal?: AbortSignal): Promise<FieldInfo[]> {
    const r = await this.call<{ name: string; type: { type: string } }[]>("/api/views/fields", {
      signal,
      method: "POST",
      body: JSON.stringify({ streams: [streamId], timerange: { type: "relative", range: rangeSec } }),
    });
    return r.map((f) => ({ name: f.name, type: f.type.type })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Scripting API search. Returns rows keyed by field name, newest first by default. */
  async messages(o: {
    query: string;
    streams: string[];
    timerange: TimeRange;
    fields: string[];
    size?: number;
    from?: number;
    sortOrder?: "asc" | "desc";
    signal?: AbortSignal;
  }): Promise<MessagePage> {
    const r = await this.call<{ schema: { name: string }[]; datarows: unknown[][] }>("/api/search/messages", {
      signal: o.signal,
      method: "POST",
      body: JSON.stringify({
        query: o.query || "*",
        streams: o.streams,
        timerange: o.timerange,
        fields: o.fields,
        sort: "timestamp",
        sort_order: o.sortOrder ?? "desc",
        from: o.from ?? 0,
        size: o.size ?? 200,
      }),
    });
    const columns = r.schema.map((c) => c.name.replace(/^field: /, ""));
    return {
      columns,
      rows: r.datarows.map((row) => Object.fromEntries(columns.map((n, i) => [n, row[i]]))),
    };
  }

  /** Grouped counts, e.g. endpoints in a stream. No time bucketing in 5.2. */
  async aggregate(o: {
    query: string;
    streams: string[];
    timerange: TimeRange;
    groupBy: { field: string; limit?: number }[];
    metrics: Metric[];
    signal?: AbortSignal;
  }): Promise<{ columns: string[]; rows: unknown[][] }> {
    const r = await this.call<{ schema: { name: string }[]; datarows: unknown[][] }>("/api/search/aggregate", {
      signal: o.signal,
      method: "POST",
      body: JSON.stringify({
        query: o.query || "*",
        streams: o.streams,
        timerange: o.timerange,
        group_by: o.groupBy.map((g) => ({ field: g.field, limit: g.limit ?? 500 })),
        metrics: o.metrics,
      }),
    });
    return { columns: r.schema.map((c) => c.name), rows: r.datarows };
  }

  /**
   * The views API, which is how the Graylog interface itself asks: a search is created, then
   * executed. Three questions need it — the timeline, an endpoint's latency, and a total —
   * because the scripting API cannot answer any of them.
   */
  private async views<T>(search: unknown, signal?: AbortSignal): Promise<Record<string, { search_types: Record<string, T> }>> {
    const created = await this.call<{ id: string }>("/api/views/search", { signal, method: "POST", body: JSON.stringify(search) });
    const run = await this.call<{ results: Record<string, { search_types: Record<string, T> }> }>(`/api/views/search/${created.id}/execute`, {
      signal,
      method: "POST",
      body: "{}",
    });
    return run.results;
  }

  /** A stream filter in the shape the views API takes, or nothing when every stream will do. */
  private static streamFilter(streams: string[]) {
    return streams.length ? { filter: { type: "or", filters: streams.map((id) => ({ type: "stream", id })) } } : {};
  }

  /**
   * Counts per time bucket, for the timeline over the results. `/api/search/aggregate` has no
   * time pivot in 5.2 — it answers "Unable to map property type" — so this goes the way the
   * Graylog UI itself goes: a search is created, then executed, and the pivot it asked for
   * comes back as rows. Two round trips, which is why only a visible timeline asks for it.
   */
  async histogram(o: { query: string; streams: string[]; timerange: TimeRange; interval: string; signal?: AbortSignal }): Promise<Bucket[]> {
    const search = {
      queries: [
        {
          id: "q",
          query: { type: "elasticsearch", query_string: o.query || "*" },
          timerange: o.timerange,
          ...(o.streams.length ? { filter: { type: "or", filters: o.streams.map((id) => ({ type: "stream", id })) } } : {}),
          search_types: [
            {
              id: "h",
              type: "pivot",
              rollup: true,
              row_groups: [{ type: "time", field: "timestamp", interval: { type: "timeunit", timeunit: o.interval } }],
              series: [{ type: "count", id: "count()" }],
            },
          ],
        },
      ],
    };
    const created = await this.call<{ id: string }>("/api/views/search", {
      signal: o.signal,
      method: "POST",
      body: JSON.stringify(search),
    });
    const run = await this.call<{
      results: Record<string, { search_types: Record<string, { rows?: { key: string[]; source: string; values: { value: number }[] }[] }> }>;
    }>(`/api/views/search/${created.id}/execute`, { signal: o.signal, method: "POST", body: "{}" });
    const rows = run.results.q?.search_types.h?.rows ?? [];
    // the rollup row carries the total under an empty key, and is not a bucket
    return rows.filter((r) => r.source === "leaf" && r.key.length).map((r) => ({ at: r.key[0], count: Number(r.values[0]?.value ?? 0) }));
  }

  /**
   * How an endpoint behaved over time: requests, the 95th percentile of its duration, and how
   * many of them failed, per bucket. Two questions in one search — the views API takes a list
   * of queries, and the failures are a query of their own — so it is one round trip more than
   * the timeline, not two.
   */
  async latency(o: {
    query: string;
    errorQuery?: string;
    durationField: string;
    streams: string[];
    timerange: TimeRange;
    interval: string;
    signal?: AbortSignal;
  }): Promise<Bucket[]> {
    const filter = Graylog.streamFilter(o.streams);
    const bucket = (id: string, series: unknown[]) => ({
      id,
      type: "pivot",
      rollup: true,
      row_groups: [{ type: "time", field: "timestamp", interval: { type: "timeunit", timeunit: o.interval } }],
      series,
    });
    const search = {
      queries: [
        {
          id: "all",
          query: { type: "elasticsearch", query_string: o.query || "*" },
          timerange: o.timerange,
          ...filter,
          search_types: [
            bucket("p", [
              { type: "count", id: "count()" },
              { type: "percentile", field: o.durationField, percentile: 95.0, id: "p95" },
            ]),
          ],
        },
        ...(o.errorQuery
          ? [
              {
                id: "bad",
                query: { type: "elasticsearch", query_string: o.errorQuery },
                timerange: o.timerange,
                ...filter,
                search_types: [bucket("e", [{ type: "count", id: "count()" }])],
              },
            ]
          : []),
      ],
    };
    const created = await this.call<{ id: string }>("/api/views/search", { signal: o.signal, method: "POST", body: JSON.stringify(search) });
    const run = await this.call<{
      results: Record<
        string,
        { search_types: Record<string, { rows?: { key: string[]; source: string; values: { key: string[]; value: number }[] }[] }> }
      >;
    }>(`/api/views/search/${created.id}/execute`, { signal: o.signal, method: "POST", body: "{}" });

    const leaves = (query: string, type: string) =>
      (run.results[query]?.search_types[type]?.rows ?? []).filter((r) => r.source === "leaf" && r.key.length);
    const value = (row: { values: { key: string[]; value: number }[] }, id: string) => row.values.find((v) => v.key.includes(id))?.value;
    const errors = new Map(leaves("bad", "e").map((r) => [r.key[0], value(r, "count()") ?? 0]));

    return leaves("all", "p").map((r) => ({
      at: r.key[0],
      count: value(r, "count()") ?? 0,
      p95: value(r, "p95"),
      errors: errors.get(r.key[0]) ?? 0,
    }));
  }

  /**
   * Total messages matching a query.
   *
   * Not through `/api/search/aggregate`: that endpoint refuses an aggregation with nothing to
   * group by — `groupings: must not be empty`, a 400 — which is exactly what a total is. The
   * views API takes a pivot with no rows at all and answers with the rollup.
   */
  async count(o: { query: string; streams: string[]; timerange: TimeRange; signal?: AbortSignal }): Promise<number> {
    const results = await this.views<{ rows?: { values: { value: number }[] }[] }>(
      {
        queries: [
          {
            id: "q",
            query: { type: "elasticsearch", query_string: o.query || "*" },
            timerange: o.timerange,
            ...Graylog.streamFilter(o.streams),
            search_types: [{ id: "t", type: "pivot", rollup: true, row_groups: [], series: [{ type: "count", id: "count()" }] }],
          },
        ],
      },
      o.signal,
    );
    return Number(results.q?.search_types.t?.rows?.[0]?.values[0]?.value ?? 0) || 0;
  }
}

// Elasticsearch, reached through Kibana, as a data source. Kibana is the address people have and
// the one an API key is made in; Elasticsearch itself is often not reachable from a laptop at
// all. Kibana's data views are the streams, and every search goes to Elasticsearch through the
// console proxy, which hands Elasticsearch's own answer back unchanged.
import { request, type Bucket, type DataSource, type FieldInfo, type MessagePage, type Metric, type Stream, type TimeRange } from "./datasource";

interface View {
  pattern: string;
  timeField: string;
}

interface Bucketed {
  key: number | string;
  key_as_string?: string;
  doc_count: number;
  [sub: string]: unknown;
}

/** What Elasticsearch calls a type, in the words the rest of Flux uses. */
const TYPES: Record<string, string> = {
  text: "string",
  keyword: "string",
  match_only_text: "string",
  wildcard: "string",
  constant_keyword: "string",
  long: "long",
  integer: "long",
  short: "long",
  byte: "long",
  unsigned_long: "long",
  double: "double",
  float: "double",
  half_float: "double",
  scaled_float: "double",
  date: "date",
  date_nanos: "date",
  boolean: "boolean",
};

/** Nested `_source` as the flat, dotted fields Flux shows: `{ log: { level } }` is `log.level`. */
export function flatten(source: Record<string, unknown>, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [key, value] of Object.entries(source)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value as Record<string, unknown>, name, out);
    else out[name] = value;
  }
  return out;
}

/** The query every search shares: the Lucene string, inside the window, on the view's time field. */
export function boolQuery(query: string, timeField: string, timerange: TimeRange) {
  const range =
    timerange.type === "absolute"
      ? { gte: timerange.from, lte: timerange.to, format: "strict_date_optional_time" }
      : { gte: `now-${timerange.range}s`, lte: "now" };
  return { bool: { filter: [{ query_string: { query: query || "*" } }, { range: { [timeField]: range } }] } };
}

/** Graylog's units are Elasticsearch's, except that a week is calendar-only there. */
export function fixedInterval(interval: string): string {
  return interval === "1w" ? "7d" : interval;
}

/**
 * The aggregation Graylog's `group_by` stands for: a `terms` per group, nested, with the metrics
 * at the bottom. `fields` turns a name into the one that can be grouped by.
 */
export function groupAggs(groupBy: { field: string; limit?: number }[], metrics: Metric[], field: (name: string) => string) {
  const leaf: Record<string, unknown> = {};
  metrics.forEach((m, i) => {
    if (m.function === "count") return;
    const on = field(m.field ?? "");
    if (m.function === "percentile") leaf[`m${i}`] = { percentiles: { field: on, percents: [m.configuration?.percentile ?? 95] } };
    else if (m.function === "card") leaf[`m${i}`] = { cardinality: { field: on } };
    else if (["avg", "min", "max", "sum"].includes(m.function)) leaf[`m${i}`] = { [m.function]: { field: on } };
    else throw new Error(`${m.function}() is not something Elasticsearch is asked for here`);
  });
  let aggs = leaf;
  for (let g = groupBy.length - 1; g >= 0; g--) {
    aggs = { [`g${g}`]: { terms: { field: field(groupBy[g].field), size: groupBy[g].limit ?? 500 }, aggs } };
  }
  return aggs;
}

/** The nested buckets back as Graylog's rows: the group values, then each metric, in order. */
export function groupRows(aggs: Record<string, unknown>, groups: number, metrics: Metric[]): unknown[][] {
  const rows: unknown[][] = [];
  const walk = (node: Record<string, unknown>, depth: number, keys: unknown[]) => {
    const buckets = (node[`g${depth}`] as { buckets: Bucketed[] } | undefined)?.buckets ?? [];
    for (const b of buckets) {
      const at = [...keys, b.key_as_string ?? b.key];
      if (depth + 1 < groups) walk(b, depth + 1, at);
      else rows.push([...at, ...metrics.map((m, i) => (m.function === "count" ? b.doc_count : metricValue(b[`m${i}`])))]);
    }
  };
  walk(aggs, 0, []);
  return rows;
}

interface EsFailure {
  error?: { type?: string; reason?: string; root_cause?: { reason?: string }[] } | string;
  status?: number;
}

/** Elasticsearch's failure inside a 200, in the words of its innermost reason. */
export function esFailure(r: EsFailure): { status: number; reason: string } | null {
  if (!r.error) return null;
  const reason = typeof r.error === "string" ? r.error : (r.error.root_cause?.[0]?.reason ?? r.error.reason ?? r.error.type ?? "failed");
  return { status: r.status ?? 500, reason };
}

function metricValue(agg: unknown): number | null {
  const a = agg as { value?: number | null; values?: Record<string, number | null> } | undefined;
  if (a?.values) return Object.values(a.values)[0] ?? null;
  return a?.value ?? null;
}

export class Kibana implements DataSource {
  readonly kind = "kibana" as const;
  private auth: string;
  /** A data view's pattern and time field, read once: neither changes while Flux is open. */
  private views = new Map<string, Promise<View>>();
  /** Which fields of a pattern can be grouped by, for the same reason. */
  private caps = new Map<string, Promise<Record<string, Record<string, { aggregatable: boolean; metadata_field?: boolean; type: string }>>>>();

  constructor(
    public url: string,
    token: string,
  ) {
    this.url = url.replace(/\/$/, "");
    // an encoded API key, as Kibana shows it when the key is made
    this.auth = `ApiKey ${token}`;
  }

  private kibana<T>(path: string, init: RequestInit = {}): Promise<T> {
    return request<T>(this.url + path, {
      ...init,
      label: path.split("?")[0],
      headers: { Authorization: this.auth, "kbn-xsrf": "true", ...(init.headers ?? {}) },
    });
  }

  /**
   * A request to Elasticsearch, through Kibana's console proxy. The proxy answers 200 whatever
   * Elasticsearch said, and puts a failure in the body, so that is where it is looked for.
   */
  private async es<T>(method: "GET" | "POST", path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const r = await request<T & EsFailure>(`${this.url}/api/console/proxy?${new URLSearchParams({ path, method }).toString()}`, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      label: path.split("?")[0],
      headers: { Authorization: this.auth, "kbn-xsrf": "true" },
    });
    const failure = esFailure(r);
    if (failure) throw new Error(`${failure.status} ${path.split("?")[0]}: ${failure.reason}`);
    return r;
  }

  private view(id: string, signal?: AbortSignal): Promise<View> {
    let v = this.views.get(id);
    if (!v) {
      v = this.kibana<{ data_view: { title: string; timeFieldName?: string } }>(`/api/data_views/data_view/${encodeURIComponent(id)}`, {
        signal,
      }).then((r) => ({ pattern: r.data_view.title, timeField: r.data_view.timeFieldName || "@timestamp" }));
      v.catch(() => this.views.delete(id));
      this.views.set(id, v);
    }
    return v;
  }

  /**
   * The index to search and the time field to search it by. No streams means every data view.
   * ponytail: views searched together use the first one's time field; per-view time fields
   * would need one search per view, add it when a mix of them turns up.
   */
  private async target(streams: string[], signal?: AbortSignal): Promise<View> {
    const ids = streams.length ? streams : (await this.streams(signal)).map((s) => s.id);
    if (!ids.length) throw new Error("This Kibana has no data views to search.");
    const views = await Promise.all(ids.map((id) => this.view(id, signal)));
    return { pattern: views.map((v) => v.pattern).join(","), timeField: views[0].timeField };
  }

  private fieldCaps(pattern: string, signal?: AbortSignal) {
    let c = this.caps.get(pattern);
    if (!c) {
      c = this.es<{ fields: Record<string, Record<string, { aggregatable: boolean; metadata_field?: boolean; type: string }>> }>(
        "GET",
        `/${pattern}/_field_caps?fields=*`,
        undefined,
        signal,
      ).then((r) => r.fields);
      c.catch(() => this.caps.delete(pattern));
      this.caps.set(pattern, c);
    }
    return c;
  }

  /**
   * The name to group by. A text field cannot be — Elasticsearch refuses, "Fielddata is
   * disabled" — but the keyword copy dynamic mapping puts beside it can, and holds the same value.
   */
  private async groupable(pattern: string, signal?: AbortSignal): Promise<(name: string) => string> {
    const caps = await this.fieldCaps(pattern, signal).catch(() => ({}) as Awaited<ReturnType<Kibana["fieldCaps"]>>);
    const aggregatable = (n: string) => Object.values(caps[n] ?? {}).some((c) => c.aggregatable);
    return (name) => (aggregatable(name) || !aggregatable(`${name}.keyword`) ? name : `${name}.keyword`);
  }

  async version(signal?: AbortSignal): Promise<string> {
    const r = await this.kibana<{ version: { number: string } }>("/api/status", { signal });
    return r.version.number;
  }

  async streams(signal?: AbortSignal): Promise<Stream[]> {
    const r = await this.kibana<{ data_view: { id: string; title: string; name?: string }[] }>("/api/data_views", { signal });
    return r.data_view
      .map((v) => ({ id: v.id, title: v.name || v.title, description: v.name && v.name !== v.title ? v.title : undefined, disabled: false }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async fields(streamId: string, _rangeSec?: number, signal?: AbortSignal): Promise<FieldInfo[]> {
    const { pattern } = await this.view(streamId, signal);
    const caps = await this.fieldCaps(pattern, signal);
    const out: FieldInfo[] = [];
    for (const [name, types] of Object.entries(caps)) {
      const [type, cap] = Object.entries(types)[0] ?? [];
      if (!cap || cap.metadata_field || type === "object" || type === "nested") continue;
      // the keyword copy of a text field is the same field to whoever is reading the logs
      if (name.endsWith(".keyword") && caps[name.slice(0, -".keyword".length)]) continue;
      out.push({ name, type: TYPES[type] ?? type });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async messages(o: Parameters<DataSource["messages"]>[0]): Promise<MessagePage> {
    const { pattern, timeField } = await this.target(o.streams, o.signal);
    const r = await this.es<{
      hits: { hits: { _id: string; _index: string; _source?: Record<string, unknown>; fields?: Record<string, unknown[]> }[] };
    }>(
      "POST",
      `/${pattern}/_search`,
      {
        query: boolQuery(o.query, timeField, o.timerange),
        sort: [{ [timeField]: { order: o.sortOrder ?? "desc", unmapped_type: "date" } }],
        from: o.from ?? 0,
        size: o.size ?? 200,
        track_total_hits: false,
        // the time as Elasticsearch formats it, to the millisecond, rather than however it was sent
        docvalue_fields: [{ field: timeField, format: "strict_date_time" }],
      },
      o.signal,
    );
    const rows = r.hits.hits.map((h) => ({
      ...flatten(h._source ?? {}),
      timestamp: h.fields?.[timeField]?.[0] ?? h._source?.[timeField],
      _id: h._id,
      streams: h._index,
    }));
    return { columns: o.fields.length ? o.fields : [...new Set(rows.flatMap((r) => Object.keys(r)))], rows };
  }

  async aggregate(o: Parameters<DataSource["aggregate"]>[0]): Promise<{ columns: string[]; rows: unknown[][] }> {
    const { pattern, timeField } = await this.target(o.streams, o.signal);
    const field = await this.groupable(pattern, o.signal);
    const r = await this.es<{ aggregations?: Record<string, unknown> }>(
      "POST",
      `/${pattern}/_search`,
      { size: 0, query: boolQuery(o.query, timeField, o.timerange), aggs: groupAggs(o.groupBy, o.metrics, field) },
      o.signal,
    );
    return {
      columns: [...o.groupBy.map((g) => g.field), ...o.metrics.map((m) => `${m.function}(${m.field ?? ""})`)],
      rows: groupRows(r.aggregations ?? {}, o.groupBy.length, o.metrics),
    };
  }

  private async timeline(
    o: { query: string; streams: string[]; timerange: TimeRange; interval: string; signal?: AbortSignal },
    sub: (timeField: string) => Record<string, unknown> = () => ({}),
  ): Promise<Bucketed[]> {
    const { pattern, timeField } = await this.target(o.streams, o.signal);
    const r = await this.es<{ aggregations?: { h?: { buckets: Bucketed[] } } }>(
      "POST",
      `/${pattern}/_search`,
      {
        size: 0,
        query: boolQuery(o.query, timeField, o.timerange),
        aggs: { h: { date_histogram: { field: timeField, fixed_interval: fixedInterval(o.interval) }, aggs: sub(timeField) } },
      },
      o.signal,
    );
    return r.aggregations?.h?.buckets ?? [];
  }

  async histogram(o: Parameters<DataSource["histogram"]>[0]): Promise<Bucket[]> {
    const buckets = await this.timeline(o);
    return buckets.map((b) => ({ at: new Date(Number(b.key)).toISOString(), count: b.doc_count }));
  }

  /** One search: the buckets carry the percentile, and the failures as a filter inside them. */
  async latency(o: Parameters<DataSource["latency"]>[0]): Promise<Bucket[]> {
    const buckets = await this.timeline(o, () => ({
      p: { percentiles: { field: o.durationField, percents: [95] } },
      ...(o.errorQuery ? { e: { filter: { query_string: { query: o.errorQuery } } } } : {}),
    }));
    return buckets.map((b) => ({
      at: new Date(Number(b.key)).toISOString(),
      count: b.doc_count,
      p95: metricValue(b.p) ?? undefined,
      errors: (b.e as { doc_count?: number } | undefined)?.doc_count ?? 0,
    }));
  }

  async count(o: Parameters<DataSource["count"]>[0]): Promise<number> {
    const { pattern, timeField } = await this.target(o.streams, o.signal);
    const r = await this.es<{ count: number }>("POST", `/${pattern}/_count`, { query: boolQuery(o.query, timeField, o.timerange) }, o.signal);
    return r.count;
  }
}

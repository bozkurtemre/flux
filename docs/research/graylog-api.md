# Graylog 5.2 REST API reference

Verified against the server source and the official docs. Flux speaks this API and
nothing else, so anything here that turns out to be wrong is a bug in `src/lib/graylog.ts`.

Checked against graylog2-server tag 5.2.12 and go2docs 5-2 on 2026-09-16.

## Auth

- Personal access token = HTTP Basic, user is the token, password is the literal `token`:
  `curl -u <TOKEN>:token -H 'Accept: application/json' ...`
- `Authorization: Bearer` does NOT work for access tokens.
- Every non-GET request MUST send `X-Requested-By: <anything>`, otherwise HTTP 400 (CSRF filter).

Docs: https://go2docs.graylog.org/5-2/setting_up_graylog/rest_api.html

## Time histograms with percentiles: Views search API (the one we use)

`POST /api/search/aggregate` exists but has NO time-bucket grouping in 5.2 (only `{field, limit}`). Use the Views pivot instead, one call per polling tick:

```
POST /api/views/search/sync?timeout=60000
Content-Type: application/vnd.graylog.search.v2+json
Accept: application/vnd.graylog.search.v2+json
X-Requested-By: Flux

{"queries":[{
  "id":"q1",
  "query":{"type":"elasticsearch","query_string":"*"},
  "timerange":{"type":"absolute","from":"2026-09-16T10:00:00.000Z","to":"2026-09-16T10:05:00.000Z"},
  "streams":["<streamId>"],
  "search_types":[{
    "id":"p1","type":"pivot","rollup":false,
    "row_groups":[
      {"type":"time","field":"timestamp","interval":{"type":"timeunit","timeunit":"5m"}},
      {"type":"values","field":"<endpointField>","limit":200},
      {"type":"values","field":"<statusField>","limit":20}],
    "column_groups":[],
    "series":[
      {"type":"count","id":"count"},
      {"type":"avg","field":"<durationField>","id":"avg"},
      {"type":"percentile","field":"<durationField>","percentile":95.0,"id":"p95"},
      {"type":"percentile","field":"<durationField>","percentile":99.0,"id":"p99"}],
    "sort":[]}]}]}
```

- Timerange shapes: `{"type":"relative","range":300}` (seconds), `{"type":"relative","from":600,"to":300}`, `{"type":"absolute","from":ISO,"to":ISO}`.
- `values` limit default 15; nested groups multiply (rows <= product of limits). Always set search-type `id`, the result map is keyed by it.
- Response: `results.q1.search_types.p1.rows[]` = `{"key":[<time>,<endpoint>,<status>],"values":[{"key":["count"],"value":123},...]}`. Check `execution.done`, `execution.completed_exceptionally`, `errors`.
- v1 media type (`application/json`) puts streams in a `filter` object; avoid, use v2.

## Simple search (Scripting API) for Error Records and samples

`POST /api/search/messages`:

```json
{
  "query": "level:<=3",
  "streams": ["<id>"],
  "timerange": { "type": "relative", "range": 60 },
  "fields": ["timestamp", "source", "message", "level", "full_message"],
  "sort": "timestamp",
  "sort_order": "desc",
  "from": 0,
  "size": 100
}
```

- Defaults: size 10, fields `source,timestamp`, timerange 24h, all readable streams when `streams` empty.
- No server-side max; indexer `index.max_result_window` (10000) caps `from+size`. Page by timestamp, not offset.
- Legacy `GET /api/search/universal/relative?query=*&range=300&limit=5&filter=streams:<id>&fields=a,b` still present.

`POST /api/search/aggregate` (no time buckets, fine for one-shot totals):

```json
{
  "query": "*",
  "streams": ["<id>"],
  "timerange": { "type": "relative", "range": 300 },
  "group_by": [{ "field": "endpoint", "limit": 50 }],
  "metrics": [{ "function": "count" }, { "function": "percentile", "field": "took_ms", "configuration": { "percentile": 95 } }]
}
```

Functions: `count avg min max sum stddev variance sumofsquares card percentile percentage latest`. Percentile MUST carry `configuration.percentile` or the server 500s.

## Streams and fields

- `GET /api/streams` -> `{"total":N,"streams":[{id,title,description,disabled}]}`; `GET /api/streams/enabled`.
- Fields present in a stream over a range: `POST /api/views/fields` body `{"streams":["<id>"],"timerange":{"type":"relative","range":86400}}` -> `[{"name","type":{"type":"long"|"string"|...}}]`.

## Limits

- No REST rate limiting in graylog2-server; only indexer load. Keep one pivot call per tick per stream.
- `sync` default timeout 60000 ms via `?timeout=`.

## Unverified

- Exact error body when exceeding `max_result_window`.
- v1 `filter` JSON type names (irrelevant, we use v2).

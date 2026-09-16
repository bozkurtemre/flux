# What a Graylog aggregation costs

Measured 2026-09-16 against a production Graylog 5.2.6 over four live streams. The numbers
drive two decisions in `src/lib/endpoints.ts`: why the tree is cached, and why the default
look-back is one hour.

## Cost follows the time range, not the bucket count

Busiest stream, grouped by route and method, `count` plus a 95th percentile:

| Variable                         | Result                        |
| -------------------------------- | ----------------------------- |
| 24h                              | 24.6s                         |
| 6h                               | 9.9s                          |
| 1h                               | 2.2s                          |
| Bucket limit 500 vs 200, 24h     | 24.6s vs 24.2s, no difference |
| Without the percentile, 24h      | 15.6s                         |
| Without the method grouping, 24h | 14.4s                         |

Shrinking the limit changes nothing because the engine still scans every document in the
range. Only the range moves the number.

## Filtering to finished requests is a correctness fix first

A service that logs several lines per request has every one of them carrying the route, so
an unfiltered aggregation counts log lines rather than requests.

| Query, 24h              | Time  | Reported "requests" |
| ----------------------- | ----- | ------------------- |
| `*`                     | 24.3s | 24,726,314          |
| `response:1`            | 10.1s | 2,953,599           |
| `_exists_:responseTime` | 10.2s | 2,987,754           |

The unfiltered count was inflated roughly eightfold. `_exists_:<duration field>` is the
generic form of the same idea: a line carrying a duration is a completed request. It also
halves the time, but the count is the reason it exists.

## With the filter, across streams

| Stream      | 1h    | 6h    | 24h    | Endpoints (24h) |
| ----------- | ----- | ----- | ------ | --------------- |
| App Api     | 1.25s | 4.16s | 10.13s | 505             |
| Core Api    | 1.04s | 3.21s | 6.77s  | 500             |
| Wallet http | 1.19s | 4.72s | 11.41s | 500             |
| Admin Api   | 0.57s | 0.59s | 0.60s  | 502             |

The error-count query, the same shape under `status:>=500`, is under a second everywhere
because it only touches the error slice.

## What this settled

- **Default look-back is one hour.** About a second per stream, which is a reasonable price
  for a first expansion. Settings names the cost so raising it is an informed choice.
- **The tree is cached on disk.** Only a cold cache and Refresh pay the query at all.
- **Always filter to finished requests**, or the traffic figures are wrong, not just slow.
- **One query per concern, not one cube.** Grouping route by method by status in a single
  aggregation exceeded 75 seconds and timed out.

## How to re-measure

The probes were plain `POST /api/search/aggregate` calls with a token in HTTP Basic, varying
one dimension at a time. Re-run them against a stream with real traffic; an idle stream, like
Admin Api above, is flat across every range and will tell you nothing.

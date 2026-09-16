# Log shapes seen in the wild

Field names one production estate actually uses, recorded 2026-09-16. `inferMapping` in
`src/lib/endpoints.ts` guesses from candidate lists; this is the evidence behind those
lists, and the place to look when a stream's endpoints come out empty.

Graylog: 5.2.5 at graylog.stage.mobylonia.com (STAGE environment). 7 streams, 3 log families. All services log JSON into `message`; Graylog extracts top-level fields.

## Streams

| Stream id                | Title                   | Family                    | Likely repo                     |
| ------------------------ | ----------------------- | ------------------------- | ------------------------------- |
| 65f008db3a52e80fc63ce8cb | Esim App Api Logs       | PHP/Monolog               | Teknasyon/esim-io-backend       |
| 65f008cb3a52e80fc63ce896 | Esim Admin Api Logs     | PHP/Monolog               | Teknasyon/esim-io-admin-backend |
| 65f008f13a52e80fc63ce916 | Esim Core Api Logs      | PHP/Monolog               | Teknasyon/esim-core-backend     |
| 69e75478b4166511f3c9e7d8 | Esim io MCP Logs        | Go (monolog-style levels) | Teknasyon/esim-io-mcp           |
| 690b1d0d1cd15450bb37b347 | Esim Wallet Logs (http) | Go (zap-style)            | Teknasyon/esimio-wallet         |
| 690b1d1a1cd15450bb37b383 | Esim Wallet Worker Logs | Go (zap-style)            | Teknasyon/esimio-wallet         |
| 690b1d001cd15450bb37b2ff | Esim Wallet Cron Logs   | Go (zap-style)            | Teknasyon/esimio-wallet         |

## Family A: PHP/Monolog (App, Admin, Core)

- `level` long (Monolog: 100 DEBUG, 200 INFO, 250 NOTICE, 300 WARNING, 400 ERROR, 500 CRITICAL, 550 ALERT, 600 EMERGENCY). Range queries on `level` FAIL (ApiError). Use `level_name` string: `level_name:(WARNING OR ERROR OR CRITICAL OR ALERT OR EMERGENCY)`.
- HTTP response line: `response:1`. Fields: `route` (real path, e.g. `/packages/MSR1GB30DAYSONESIM/plan-details`), `method`, `httpStatusCode` long, `responseTime` float **seconds**.
- Non-HTTP lines carry `route:"/"`, `httpStatusCode:0`. Filter metrics on `response:1`.
- Other useful: `channel` (app, doctrine, messenger, http_client), `errorCode`, `requestId`, `correlationId`, `logInformation` (error code string), `service` (esim-APP / esim-ADMIN / esim-CORE).
- Exceptions: `context.exception` is `{}` — NO stack trace, NO file/line in logs. GitHub linking for PHP must go through message text (code search of the `msg` template), not traces.

## Family B: Go, esim-io-mcp

- `level` long + `level_name` string, same Monolog numbering. Use `level_name`.
- Response line: `message` contains `"msg":"http response sent"`; fields `route`, `method`, `httpStatusCode`. Duration is only inside the `context` STRING (`duration_ms=0`), not a numeric field → counts and status only, no latency, until the service exposes `duration_ms` top-level.
- Routes seen: `/health-check`, `/sse`.

## Family C: Go zap-style, esimio-wallet (http / worker / cron)

- `level` STRING: DEBUG, INFO, WARN, ERROR (FATAL presumably). `level:ERROR` returned no rows in 7 days (none happened); `_exists_:error` works and returns WARN rows. Verify `level:WARN` query in implementation.
- http response line: `response:1`; fields `uri` (real path with UUIDs, e.g. `/v1.0/wallet/<uuid>/0`), `method`, `httpStatus` long, `responseTime` float seconds, `totalResponseTime`.
- `error` string, `errorCode` string (`400-2`), `requester`, `requestId`.
- `caller` = `/app/<path>.go:<line>` on every line. `/app/` is the container workdir = repo root → direct GitHub link `blob/<sha>/<path>#L<line>`. On http lines `caller` points at the logger middleware (`pkg/middlewares/http_logger.go`), on worker/cron lines at the real call site.
- worker: `eventName`, `consumerName`, `completedIn` seconds. cron: `job`, `jobId`, `completedIn`.

## Endpoint normalization needed

- UUIDs → `:uuid`; numeric segments → `:id`; PHP package codes (`/packages/MSR1GB30DAYSONESIM/…`) → `/packages/:code/…`; 24-hex Mongo ids → `:oid`.

## GitHub deploy workflows (all default branch = main)

| Repo                  | Stage deploy                  | Prod deploy                                                     |
| --------------------- | ----------------------------- | --------------------------------------------------------------- |
| esim-io-backend       | `stage.yml` on branch `stage` | `gcp-prod.yml` on `main`                                        |
| esim-io-admin-backend | `stage.yml` on `stage`        | `gcp-prod.yml` on `main`                                        |
| esim-core-backend     | `stage.yml` on `stage`        | `gcp-prod.yml` on `main`                                        |
| esimio-wallet         | `rc.yml` on `stage`           | `prod.yml` (HTTP), `prod-worker.yml`, `prod-cron.yml` on `main` |
| esim-io-mcp           | `stage.yml` on `stage`        | `prod.yml` on `main`                                            |

Stage deploys are triggered from the `stage` branch, not `main`. The earlier assumption "main = deploy" holds only for prod.

## Token notes

- Graylog token in Basic auth: in zsh write `"${GRAYLOG_TOKEN}:token"` with braces; `$VAR:token` is parsed as a `:t` modifier and mangles the string.
- GitHub classic PAT scopes present: `repo`, `read:org`. Org: Teknasyon.

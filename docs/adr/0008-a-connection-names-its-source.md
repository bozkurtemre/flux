# A connection names its source

Flux read Graylog and nothing else, and the code said so everywhere: a connection had a
`graylogUrl`, the store made a `Graylog` client, the tree's types came from `graylog.ts`. A
team that keeps its logs in Elasticsearch had no way in. A connection now carries a `kind`,
and each kind has an adapter that answers the same questions: the streams, their fields, a
page of messages, a count, grouped counts, the timeline, and an endpoint's latency.
`src/lib/datasource.ts` is that contract; `graylog.ts` and `kibana.ts` are the two adapters.
`clientFor()` in the store is the only place that picks one.

The contract is the Graylog client's own surface, not a new design, because everything above
it already worked against that surface and nothing there needed to change. Two things make
the second adapter fit without stretching it. Lucene is the query language of both, so the
console, the clauses and the endpoint filters pass through untranslated. And the adapter
normalises a row before it leaves: `timestamp` is always the time as an ISO string, whatever
the source calls its time field, and nested documents arrive flat, in dotted names.

The Elasticsearch adapter goes through Kibana rather than to Elasticsearch directly. The
Kibana address is the one people have, the API key is made there, and Elasticsearch itself is
often not reachable from a laptop. A Kibana data view is a stream. Searches go to
Elasticsearch through Kibana's console proxy, which hands Elasticsearch's answer back as it
was, except that it always answers 200, so the adapter looks for a failure in the body.

## Consequences

`connections.json` names the source of each connection, and the URL and token are `url` and
`token`. A file written before this has `graylogUrl` and `graylogToken`, and is read as
Graylog connections under the new names; a set-up file without a `kind` is Graylog as well.
Older versions of Flux cannot read a file written after this, and a downgrade has to re-enter
its connections.

A third source is an adapter and a line in `SOURCE_KINDS`. What it cannot answer is the
limit: a source with no Lucene and no grouped counts would have to translate the console,
and that is a bigger change than an adapter.

The console proxy is a Kibana API made for Dev Tools, not a documented search API. If a
Kibana turns it off or a future version removes it, the adapter would have to call
Elasticsearch directly, which needs Elasticsearch to be reachable. The proxy is used because
today it is the only route that needs nothing but Kibana.

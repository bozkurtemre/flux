#!/usr/bin/env node
// The release bucket, over R2's S3-compatible API, signed here rather than by a CLI: the
// token is scoped to this one bucket, which the REST API that `wrangler r2 object put`
// speaks refuses, and a signer we can run locally is one we can try before CI does.
//
//   R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… node scripts/r2.mjs \
//     put   <bucket> <key> <file> [content-type] [cache-control]
//     prune <bucket> <keep-newest>      # leaves the manifest and the newest N versions
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

/** Sign one request the way S3 wants it, and send it. */
async function send({ method, bucket, key = "", query = {}, body = Buffer.alloc(0), headers = {} }) {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: id, R2_SECRET_ACCESS_KEY: secret } = process.env;
  if (!account || !id || !secret) throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required");

  const host = `${account}.r2.cloudflarestorage.com`;
  const stamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = stamp.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`;
  const payloadHash = sha256(body);

  const all = { ...headers, host, "x-amz-content-sha256": payloadHash, "x-amz-date": stamp };
  const present = Object.entries(all).filter(([, v]) => v !== undefined && v !== "");
  const signed = present.map(([k]) => k.toLowerCase()).sort();
  const canonicalHeaders = signed.map((k) => `${k}:${String(all[k] ?? all[Object.keys(all).find((x) => x.toLowerCase() === k)]).trim()}\n`).join("");
  const uri = `/${bucket}${key ? `/${key}` : ""}`
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join("&");

  const canonicalRequest = [method, uri, canonicalQuery, canonicalHeaders, signed.join(";"), payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(canonicalRequest)].join("\n");
  const signingKey = ["AWS4" + secret, date, "auto", "s3", "aws4_request"].reduce((k, part) => hmac(k, part));
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const url = `https://${host}${uri}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...Object.fromEntries(present),
      Authorization: `AWS4-HMAC-SHA256 Credential=${id}/${scope}, SignedHeaders=${signed.join(";")}, Signature=${signature}`,
    },
    body: method === "PUT" ? body : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${key || bucket} failed: ${res.status} ${res.statusText}\n${await res.text()}`);
  return res;
}

const compare = (a, b) => {
  const parts = (v) => v.split(".").map(Number);
  const [x, y] = [parts(a), parts(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

/**
 * Which keys to remove so that only the newest `keep` versions are left. The manifest has no
 * version of its own and is never a candidate, and a folder whose name is not a version is
 * left alone: deleting what we do not understand is not tidying.
 */
export function stale(keys, keep) {
  const version = (key) => /^updates\/(\d+\.\d+\.\d+)\//.exec(key)?.[1];
  const versions = [...new Set(keys.map(version).filter(Boolean))].sort(compare).reverse();
  const doomed = new Set(versions.slice(keep));
  return keys.filter((key) => doomed.has(version(key)));
}

async function listKeys(bucket, prefix) {
  const xml = await (await send({ method: "GET", bucket, query: { "list-type": "2", prefix, "max-keys": "1000" } })).text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
}

const [command, bucket, ...rest] = process.argv.slice(2);

if (command === "put") {
  const [key, file, contentType = "application/octet-stream", cacheControl] = rest;
  const body = readFileSync(file);
  await send({ method: "PUT", bucket, key, body, headers: { "content-type": contentType, "cache-control": cacheControl } });
  console.log(`put ${bucket}/${key} (${body.length} bytes, ${contentType})`);
} else if (command === "prune") {
  const keep = Number(rest[0] ?? 2);
  const keys = await listKeys(bucket, "updates/");
  const doomed = stale(keys, keep);
  for (const key of doomed) {
    await send({ method: "DELETE", bucket, key });
    console.log(`deleted ${bucket}/${key}`);
  }
  console.log(doomed.length ? `kept the newest ${keep} versions` : `nothing older than the newest ${keep} versions`);
} else if (command) {
  console.error(`unknown command: ${command}`);
  process.exit(1);
}

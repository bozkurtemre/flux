#!/usr/bin/env node
// Put one object into R2 over its S3-compatible API, signed with SigV4.
//
// Why not a CLI: the token this uses is scoped to a single bucket, which the REST API that
// `wrangler r2 object put` speaks does not accept, and reaching for the AWS CLI would add a
// tool that cannot be tried here before CI runs it. Node can sign the request itself.
//
//   R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… \
//     node scripts/r2-put.mjs <bucket> <key> <file> [content-type] [cache-control]
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const [bucket, key, file, contentType = "application/octet-stream", cacheControl] = process.argv.slice(2);
const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: id, R2_SECRET_ACCESS_KEY: secret } = process.env;

if (!bucket || !key || !file) {
  console.error("usage: r2-put.mjs <bucket> <key> <file> [content-type] [cache-control]");
  process.exit(1);
}
if (!account || !id || !secret) {
  console.error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required");
  process.exit(1);
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (k, data) => createHmac("sha256", k).update(data).digest();

const body = readFileSync(file);
const host = `${account}.r2.cloudflarestorage.com`;
const stamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20260917T081000Z
const date = stamp.slice(0, 8);
const region = "auto";
const scope = `${date}/${region}/s3/aws4_request`;
const payloadHash = sha256(body);

// every header we sign has to be sent, and every header we send that matters has to be signed
const headers = {
  "cache-control": cacheControl,
  "content-type": contentType,
  host,
  "x-amz-content-sha256": payloadHash,
  "x-amz-date": stamp,
};
const present = Object.entries(headers).filter(([, v]) => v !== undefined && v !== "");
const signedHeaders = present.map(([k]) => k).sort();
const canonicalHeaders = signedHeaders.map((k) => `${k}:${String(headers[k]).trim()}\n`).join("");
const canonicalUri = `/${bucket}/${key}`
  .split("/")
  .map((segment) => encodeURIComponent(segment))
  .join("/");

const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders.join(";"), payloadHash].join("\n");
const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(canonicalRequest)].join("\n");
const signingKey = ["AWS4" + secret, date, region, "s3", "aws4_request"].reduce((k, part) => hmac(k, part));
const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

const res = await fetch(`https://${host}${canonicalUri}`, {
  method: "PUT",
  headers: {
    ...Object.fromEntries(present),
    Authorization: `AWS4-HMAC-SHA256 Credential=${id}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`,
  },
  body,
});

if (!res.ok) {
  console.error(`PUT ${key} failed: ${res.status} ${res.statusText}\n${await res.text()}`);
  process.exit(1);
}
console.log(`put ${bucket}/${key} (${body.length} bytes, ${contentType})`);

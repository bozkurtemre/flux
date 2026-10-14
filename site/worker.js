// flux.emreb.dev: the static pages, plus the two things a static page cannot do — send
// "Download" to whatever version is on offer right now, and say which version that is. Both
// read the update manifest the app itself reads, so the site never names a version the app
// would not install.
const MANIFEST = "https://updates.emreb.dev/updates/latest.json";
// the documentation, hosted by Mintlify and served here under /docs: these paths are proxied to
// it with the headers it asks for, so its links come back as flux.emreb.dev/docs/…
const DOCS_HOST = "flux-702021f8.mintlify.site";
const DOCS_PATHS = ["/docs", "/mintlify-assets/", "/_mintlify/"];

async function latest() {
  const res = await fetch(MANIFEST, { cf: { cacheTtl: 60 }, headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  const manifest = await res.json();
  return {
    version: manifest.version,
    published: manifest.pub_date ?? null,
    dmg: `https://updates.emreb.dev/updates/${manifest.version}/Flux_${manifest.version}_universal.dmg`,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/download" || url.pathname === "/download/") {
      try {
        return Response.redirect((await latest()).dmg, 302);
      } catch {
        return Response.redirect("https://github.com/bozkurtemre/flux/releases/latest", 302);
      }
    }
    if (url.pathname === "/api/latest") {
      try {
        return Response.json(await latest(), { headers: { "Cache-Control": "public, max-age=60" } });
      } catch {
        return Response.json({ error: "unavailable" }, { status: 503 });
      }
    }
    if (DOCS_PATHS.some((p) => url.pathname === p.replace(/\/$/, "") || url.pathname.startsWith(p.endsWith("/") ? p : p + "/"))) {
      const upstream = new URL(request.url);
      upstream.hostname = DOCS_HOST;
      const headers = new Headers(request.headers);
      headers.set("Host", DOCS_HOST);
      headers.set("X-Forwarded-Host", url.hostname);
      headers.set("X-Forwarded-Proto", "https");
      const ip = request.headers.get("CF-Connecting-IP");
      if (ip) headers.set("CF-Connecting-IP", ip);
      return fetch(new Request(upstream, { method: request.method, headers, body: request.body, redirect: "manual" }));
    }
    return env.ASSETS.fetch(request);
  },
};

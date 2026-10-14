// flux.emreb.dev: the static pages, plus the two things a static page cannot do — send
// "Download" to whatever version is on offer right now, and say which version that is. Both
// read the update manifest the app itself reads, so the site never names a version the app
// would not install.
const MANIFEST = "https://updates.emreb.dev/updates/latest.json";
const DOCS = "https://docs.flux.emreb.dev";

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
    if (url.pathname === "/docs" || url.pathname.startsWith("/docs/")) {
      return Response.redirect(DOCS + url.pathname.slice("/docs".length) + url.search, 302);
    }
    return env.ASSETS.fetch(request);
  },
};

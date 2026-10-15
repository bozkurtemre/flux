// log lines drifting through the sky behind the landing page, and now and then a deploy with the lines it
// brings: the shop of the story, logging. Made of the story's own names; faint, slow, a few at a time,
// paused while the tab is hidden, and left out entirely under reduced motion.
(() => {
  const sky = document.querySelector(".sky");
  if (!sky || !document.getElementById("story") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = document.createElement("div");
  layer.className = "sky-logs";
  layer.setAttribute("aria-hidden", "true");
  sky.insertBefore(layer, sky.querySelector(".fade"));

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const id = () => Math.random().toString(16).slice(2, 10);
  const ord = () => `ord-${10000 + Math.floor(Math.random() * 9999)}`;
  const ms = (a, b) => a + Math.floor(Math.random() * (b - a));
  // [weight, level, host, message]
  const LINES = [
    [6, "INFO", "gateway-1", () => `GET /v1/products/${ms(1000, 9999)} 200 in ${ms(6, 60)} ms`],
    [4, "INFO", "gateway-2", () => `GET /v1/cart 200 in ${ms(4, 30)} ms`],
    [4, "INFO", "orders-1", () => `Order ${ord()} created`],
    [3, "INFO", "payments-1", () => `Charge captured for ${ord()}: ${ms(9, 240)}.${ms(10, 99)} EUR`],
    [3, "INFO", "wallet-1", () => `Hold placed for ${ord()}`],
    [2, "INFO", "gateway-1", () => `POST /v1/checkout accepted · req_${id()}`],
    [2, "WARN", "payments-2", () => `upstream slow: took ${ms(2100, 4800)} ms`],
    [1, "WARN", "payments-2", () => `Provider call timed out, retrying 1/2`],
    [1, "ERROR", "payments-2", () => `Charge failed: upstream timeout after 8000ms`],
    [1, "ERROR", "gateway-2", () => `POST /v1/checkout 502 in ${ms(8040, 8090)} ms`],
  ];
  const bag = LINES.flatMap((l) => Array(l[0]).fill(l));
  const DEPLOYS = [
    ["shop", "v2.4.2", "#418 retry only on connect errors"],
    ["shop", "v2.4.3", "#421 cache product images"],
    ["wallet", "v0.9.8", "#57 holds expire after 15 min"],
    ["gateway", "v3.12.1", "#203 rate limit per token"],
  ];
  let clock = (10 * 60 + 30) * 60; // 10:30:00, the story's morning
  const stamp = () => {
    clock += ms(1, 9);
    const t = clock % 86400;
    return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((n) => String(n).padStart(2, "0")).join(":");
  };
  const span = (cls, text) => {
    const s = document.createElement("span");
    if (cls) s.className = cls;
    s.textContent = text;
    return s;
  };

  let live = 0;
  const most = () => (matchMedia("(max-width: 640px)").matches ? 4 : 7);
  const float = (el, y, seconds, under = 0) => {
    layer.append(el);
    live++;
    const w = el.getBoundingClientRect().width;
    const leftward = Math.random() < 0.5;
    const from = leftward ? innerWidth + 40 : -w - 40;
    const to = leftward ? -w - 40 : innerWidth + 40;
    el.style.top = `${y}px`;
    const run = el.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], {
      duration: seconds * 1000,
      easing: "linear",
    });
    // the lines there when the page opens are already on their way across
    run.currentTime = under * seconds * 1000;
    run.onfinish = () => {
      el.remove();
      live--;
    };
  };
  const logLine = (y, seconds = ms(26, 42), under = 0) => {
    const [, level, host, text] = pick(bag);
    const el = document.createElement("div");
    el.className = "sky-log";
    el.append(span("t", `${stamp()}  `), span("", `${host.padEnd(11)}`), span(level.toLowerCase(), `${level.padEnd(6)}`), span("", text()));
    float(el, y ?? ms(60, innerHeight - 40), seconds, under);
  };
  const deploy = () => {
    const [service, version, pr] = pick(DEPLOYS);
    const el = document.createElement("div");
    el.className = "sky-log deploy";
    const what = document.createElement("b");
    what.textContent = `${service} ${version}`;
    el.append(span("", "▲ deploy "), what, span("", `  ${pr} · merged`));
    const y = ms(90, innerHeight - 120);
    float(el, y, ms(30, 38));
    // the lines it brings, close behind it
    [1, 2, 3].forEach((n) => setTimeout(() => !document.hidden && logLine(y + n * 20, ms(30, 38)), n * 900));
  };

  let nextDeploy = performance.now() + ms(6000, 12000);
  const tick = () => {
    if (!document.hidden) {
      if (performance.now() >= nextDeploy) {
        deploy();
        nextDeploy = performance.now() + ms(20000, 40000);
      } else if (live < most()) logLine();
    }
    setTimeout(tick, ms(2200, 4200));
  };
  // a few already on their way when the page opens
  for (let i = 0; i < 4; i++) logLine(undefined, ms(26, 42), 0.15 + Math.random() * 0.6);
  setTimeout(tick, 2500);
})();

// the reading lane (site.css): how far into the chapters the page is, as --lane from 0 to 1. Nothing at the
// top of the page; it rises over the first 140px of scroll, so the hero is covered as soon as the reader
// moves, and falls while the story's bottom climbs from 85% to 40% of the window, going out with the last.
(() => {
  const root = document.documentElement;
  const story = document.getElementById("story");
  if (!story) return;
  const ramp = (edge, h) => Math.min(1, Math.max(0, (h * 0.85 - edge) / (h * 0.45)));
  let queued = false;
  const update = () => {
    queued = false;
    const h = innerHeight;
    const lane = Math.min(1, scrollY / 140) * (1 - ramp(story.getBoundingClientRect().bottom, h));
    root.style.setProperty("--lane", lane.toFixed(3));
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
  update();
})();

// the sky's streams: the sign-in panel's waves, more of them and taller, across the whole sky
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const g = document.getElementById("streams");
  if (!g) return;
  const smooth = (pts) => {
    const out = [`M${pts[0][0]},${pts[0][1].toFixed(1)}`];
    for (let i = 0; i < pts.length - 1; i++) {
      const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      out.push(`C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1].toFixed(1)}`);
    }
    return out.join(" ");
  };
  for (let i = 0; i < 22; i++) {
    const y = 120 + i * 38;
    const amp = 70 + (i % 4) * 18;
    const phase = i * 0.37;
    const pts = [];
    for (let x = -200; x <= 1900; x += 50) pts.push([x, y + Math.sin(x / 260 + phase) * amp + Math.sin(x / 110 + phase * 1.7) * amp * 0.22]);
    const d = smooth(pts);
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "url(#stream)");
    path.setAttribute("stroke-width", i % 5 === 2 ? 1.6 : 0.8);
    path.setAttribute("stroke-opacity", (0.1 + (i % 5 === 2 ? 0.3 : (i % 3) * 0.06)).toFixed(2));
    g.append(path);
    if (i % 4 === 1) {
      const light = document.createElementNS(NS, "path");
      light.setAttribute("d", d);
      light.setAttribute("fill", "none");
      light.setAttribute("stroke", "#8cf7e2");
      light.setAttribute("stroke-width", "1.8");
      light.setAttribute("stroke-opacity", "0.55");
      light.setAttribute("stroke-linecap", "round");
      light.setAttribute("pathLength", "1000");
      light.setAttribute("stroke-dasharray", "60 940");
      light.setAttribute("class", "flow");
      light.style.animationDuration = `${8 + (i % 4) * 1.6}s`;
      light.style.animationDelay = `${-i * 0.9}s`;
      g.append(light);
    }
  }
})();

// window.flux — the foundation's global. Nothing else may add globals. The header builder adds
// flux.island onto it; the hero builder adds flux.stage; every section script guards on both.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const listeners = new Map();
  const svgUse = (href, cls) => {
    const svg = document.createElementNS(NS, "svg");
    if (cls) svg.setAttribute("class", cls);
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(NS, "use");
    use.setAttribute("href", href);
    svg.append(use);
    return svg;
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (n) => n.toLocaleString("en-US");
  /** Swaps a button's text (keeping any icon beside it); returns the way back. */
  const relabel = (button, text) => {
    const node = [...button.childNodes].find((n) => n.nodeType === 3 && n.data.trim());
    if (node) {
      const was = node.data;
      node.data = text;
      return () => (node.data = was);
    }
    const was = button.textContent;
    button.textContent = text;
    return () => (button.textContent = was);
  };
  const relabels = new WeakMap();
  const relabelFor = (button, text, ms) => {
    const pending = relabels.get(button);
    if (pending) {
      clearTimeout(pending.t);
      pending.restore();
    }
    const restore = relabel(button, text);
    relabels.set(button, { restore, t: setTimeout(() => (restore(), relabels.delete(button)), ms) });
  };

  // ---- the chapters: one observer, the section crossing the viewport's middle is current ----
  const chapters = new Map(); // section element → the registered entry
  const inView = new Map(); // element → how much of the middle band it covers
  const FOOT = { id: "foot", clock: "11:02", label: "All clear" };
  let active = null;
  let seen = false;
  const change = (next) => {
    if (next === active) return;
    const prev = active;
    active = next;
    if (prev && prev.leave) prev.leave();
    if (next && next.el) {
      seen = true;
      if (next.enter) next.enter({ instant: flux.reduced, first: !next.entered });
      next.entered = true;
    }
    flux.chapters.current = next && next.el ? next : null;
    if (flux.stage) flux.stage.touched = false;
    const { id, clock, label } = next || (seen ? FOOT : { id: null, clock: "10:41", label: "The spike" });
    if (flux.island) flux.island.readout(clock, label);
    flux.emit("chapter", { id, clock, label });
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) inView.set(e.target, e.intersectionRect.height);
        else inView.delete(e.target);
      }
      let next = null;
      let best = -1;
      for (const [el, h] of inView) {
        if (h <= best) continue;
        const entry = el.id === "foot" && !chapters.has(el) ? FOOT : chapters.get(el);
        if (entry) {
          best = h;
          next = entry;
        }
      }
      // a gap between two chapters (or the stage passing through the band on a phone): the chapter the
      // reader has scrolled past last is still the current one, also after a jump over several of them
      if (!next) {
        let top = -Infinity;
        for (const entry of chapters.values()) {
          const at = entry.el.getBoundingClientRect().top;
          if (at < innerHeight / 2 && at > top) {
            top = at;
            next = entry;
          }
        }
      }
      if (next) change(next);
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
  );

  const flux = {
    reduced: motion.matches,
    mobile: () => matchMedia("(max-width: 640px)").matches,
    paused: document.hidden,

    // one fetch for the whole page; null on 404, 503, network trouble or bad JSON
    latest: fetch("/api/latest")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => (v && v.version ? v : null))
      .catch(() => null),

    /** "today" | "yesterday" | "N days ago"; "" when iso is null or invalid. */
    relative(iso) {
      const d = iso ? new Date(iso) : null;
      if (!d || Number.isNaN(d.getTime())) return "";
      const day = (t) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
      const days = Math.round((day(new Date()) - day(d)) / 864e5);
      return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
    },
    /** lib/island.ts ago(): "4s" | "3m" | "2h". */
    ago(ms) {
      const s = Math.max(0, Math.round(ms / 1000));
      if (s < 60) return `${s}s`;
      if (s < 3600) return `${Math.round(s / 60)}m`;
      return `${Math.round(s / 3600)}h`;
    },

    // ---- a tiny bus ----
    on(name, fn) {
      let set = listeners.get(name);
      if (!set) listeners.set(name, (set = new Set()));
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(name, detail) {
      const set = listeners.get(name);
      if (!set) return;
      for (const fn of [...set]) {
        try {
          fn(detail);
        } catch (e) {
          setTimeout(() => {
            throw e;
          });
        }
      }
    },

    chapters: {
      register(el, { clock, label, scene, enter, leave } = {}) {
        const entry = { el, id: el.id, clock, label, scene, enter, leave, entered: false };
        chapters.set(el, entry);
        io.observe(el);
        return entry;
      },
      current: null,
    },

    /** steps = [[delayMs, fn], ...], delays relative to the previous step; returns cancel(). */
    play(steps) {
      if (flux.reduced) {
        steps.forEach(([, fn]) => fn({ instant: true }));
        return () => {};
      }
      let t = 0;
      const ids = [];
      steps.forEach(([d, fn]) => {
        t += d;
        ids.push(setTimeout(() => fn({ instant: false }), t));
      });
      return () => ids.forEach(clearTimeout);
    },
    /** cb(el) once, when 15% of el is on screen; returns stop(). */
    reveal(el, cb) {
      if (!el) return () => {};
      const seer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          seer.disconnect();
          cb(el);
        },
        { threshold: 0.15 },
      );
      seer.observe(el);
      return () => seer.disconnect();
    },
    /** Types text into el.textContent; returns cancel(). Reduced motion: the whole text at once. */
    typewriter(el, text, { cps = 40, done } = {}) {
      if (flux.reduced) {
        el.textContent = text;
        if (done) done();
        return () => {};
      }
      const chars = Array.from(text);
      let i = 0;
      el.textContent = "";
      const t = setInterval(() => {
        el.textContent = chars.slice(0, ++i).join("");
        if (i < chars.length) return;
        clearInterval(t);
        if (done) done();
      }, 1000 / cps);
      return () => clearInterval(t);
    },
    /** An ease-out number tween on requestAnimationFrame; returns cancel(). Reduced motion: step(to) once. */
    tween(from, to, ms, step, done) {
      if (flux.reduced || !(ms > 0)) {
        step(to);
        if (done) done();
        return () => {};
      }
      const t0 = performance.now();
      let id = requestAnimationFrame(function frame(now) {
        const t = Math.min(1, (now - t0) / ms);
        step(from + (to - from) * (1 - Math.pow(1 - t, 3)));
        if (t < 1) id = requestAnimationFrame(frame);
        else if (done) done();
      });
      return () => cancelAnimationFrame(id);
    },

    /**
     * "shift+meta+i", "meta+k", "escape", "meta+enter" or "shift shift" (two bare Shifts within 400ms).
     * Off while an input, textarea, select or contenteditable has focus unless `when` says otherwise.
     * preventDefault only when fn returns true. ⌘K accepts Ctrl+K, nothing else does. Returns off().
     */
    onKey(combo, fn, { when } = {}) {
      const typing = () => {
        const a = document.activeElement;
        return a && a.matches("input, textarea, select, [contenteditable=true]");
      };
      const ok = when || (() => !typing());
      if (combo === "shift shift") {
        let last = 0;
        let clean = true;
        const h = (e) => {
          if (e.key !== "Shift") {
            clean = false;
            return;
          }
          if (e.repeat) return;
          const now = performance.now();
          if (clean && now - last < 400 && ok()) {
            last = 0;
            if (fn(e)) e.preventDefault();
          } else last = now;
          clean = true;
        };
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
      }
      const want = combo.split("+");
      const key = want.pop();
      const h = (e) => {
        if (e.key.toLowerCase() !== key && !(key === "enter" && e.key === "Enter")) return;
        const mods = { shift: e.shiftKey, meta: e.metaKey || (key !== "k" ? false : e.ctrlKey), alt: e.altKey, ctrl: e.ctrlKey };
        for (const m of ["shift", "meta", "alt"]) if (want.includes(m) !== !!mods[m]) return;
        if (!ok()) return;
        if (fn(e)) e.preventDefault();
      };
      document.addEventListener("keydown", h);
      return () => document.removeEventListener("keydown", h);
    },

    /**
     * The app's context menu. items: [{label, icon, shortcut, disabled, danger, onClick} | {separator: true}].
     * at: {x, y} page coords or an anchor element; within: the element the menu is clamped inside and
     * appended to (position absolute), else body (position fixed). Returns close(). `.cur` follows focus,
     * so focusing an item moves the cursor there.
     */
    menu(items, { at, within, onClose } = {}) {
      const before = document.activeElement;
      const el = document.createElement("div");
      el.className = "menu";
      el.setAttribute("role", "menu");
      el.tabIndex = -1;
      const rows = [];
      for (const it of items) {
        if (it.separator) {
          el.append(document.createElement("hr"));
          continue;
        }
        const b = document.createElement("button");
        b.type = "button";
        b.className = it.danger ? "mi danger" : "mi";
        b.setAttribute("role", "menuitem");
        b.tabIndex = -1;
        if (it.disabled) b.setAttribute("aria-disabled", "true");
        if (it.icon) b.append(svgUse(it.icon));
        b.append(document.createTextNode(it.label || ""));
        if (it.shortcut) {
          const sc = document.createElement("span");
          sc.className = "sc";
          sc.textContent = it.shortcut;
          b.append(sc);
        }
        b.addEventListener("click", () => {
          if (it.disabled) return;
          close();
          if (it.onClick) it.onClick();
        });
        b.addEventListener("pointerenter", () => {
          if (!it.disabled) b.focus({ preventScroll: true });
        });
        rows.push(b);
        el.append(b);
      }
      const enabled = () => rows.filter((b) => b.getAttribute("aria-disabled") !== "true");
      el.addEventListener("focusin", (e) => rows.forEach((r) => r.classList.toggle("cur", r === e.target)));
      el.addEventListener("contextmenu", (e) => e.preventDefault());
      el.addEventListener("keydown", (e) => {
        const list = enabled();
        const i = list.indexOf(document.activeElement);
        const go = (b) => {
          e.preventDefault();
          if (b) b.focus({ preventScroll: true });
        };
        if (e.key === "ArrowDown") go(list[(i + 1) % list.length]);
        else if (e.key === "ArrowUp") go(list[(i - 1 + list.length) % list.length]);
        else if (e.key === "Home") go(list[0]);
        else if (e.key === "End") go(list[list.length - 1]);
        else if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      });
      let open = true;
      const outside = (e) => {
        if (!el.contains(e.target)) close();
      };
      const close = () => {
        if (!open) return;
        open = false;
        const had = el.contains(document.activeElement);
        el.remove();
        document.removeEventListener("pointerdown", outside, true);
        window.removeEventListener("scroll", close);
        window.removeEventListener("resize", close);
        const back = at && at.nodeType === 1 ? at : before;
        if (had && back && back.isConnected && back.focus) back.focus({ preventScroll: true });
        if (onClose) onClose();
      };
      // measure, then place: under an anchor, at the pointer, or centred; clamped 6px inside
      const host = within || document.body;
      el.style.position = within ? "absolute" : "fixed";
      el.style.visibility = "hidden";
      host.append(el);
      const r = el.getBoundingClientRect();
      let x;
      let y;
      if (at && at.nodeType === 1) {
        const a = at.getBoundingClientRect();
        x = a.left;
        y = a.bottom + 4;
      } else if (at) {
        x = at.x - scrollX;
        y = at.y - scrollY;
      } else {
        x = (innerWidth - r.width) / 2;
        y = (innerHeight - r.height) / 2;
      }
      if (within) {
        const w = within.getBoundingClientRect();
        x = clamp(x - w.left - within.clientLeft, 6, Math.max(6, within.clientWidth - r.width - 6)) + within.scrollLeft;
        y = clamp(y - w.top - within.clientTop, 6, Math.max(6, within.clientHeight - r.height - 6)) + within.scrollTop;
      } else {
        x = clamp(x, 6, Math.max(6, innerWidth - r.width - 6));
        y = clamp(y, 6, Math.max(6, innerHeight - r.height - 6));
      }
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.style.visibility = "";
      document.addEventListener("pointerdown", outside, true);
      window.addEventListener("scroll", close);
      window.addEventListener("resize", close);
      (enabled()[0] || el).focus({ preventScroll: true });
      return close;
    },

    /** The app's balloon in the page corner; max 3, oldest dropped; paused on hover. Returns close(). */
    tip(title, body, { action, ms = 6000, icon = "#i-info" } = {}) {
      let box = document.getElementById("tips");
      if (!box) {
        box = document.createElement("div");
        box.id = "tips";
        box.className = "tips";
        box.setAttribute("role", "status");
        box.setAttribute("aria-live", "polite");
        document.body.append(box);
      }
      while (box.children.length >= 3) {
        const oldest = tips.get(box.firstElementChild);
        if (oldest) oldest();
        else box.firstElementChild.remove();
      }
      const el = document.createElement("div");
      el.className = "tip";
      el.append(svgUse(icon, "bi"));
      const text = document.createElement("div");
      text.className = "body";
      const bt = document.createElement("div");
      bt.className = "bt";
      bt.textContent = title;
      const bm = document.createElement("div");
      bm.className = "bm";
      bm.textContent = body || "";
      text.append(bt, bm);
      if (action) {
        const bb = document.createElement("button");
        bb.type = "button";
        bb.className = "bb";
        bb.textContent = action.label;
        bb.addEventListener("click", () => {
          close();
          if (action.run) action.run();
        });
        text.append(bb);
      }
      const x = document.createElement("button");
      x.type = "button";
      x.className = "x";
      x.setAttribute("aria-label", "Dismiss");
      x.append(svgUse("#i-x"));
      x.addEventListener("click", () => close());
      el.append(text, x);
      let t = 0;
      const arm = () => {
        clearTimeout(t);
        if (ms > 0) t = setTimeout(close, ms);
      };
      const close = () => {
        clearTimeout(t);
        el.remove();
        tips.delete(el);
      };
      el.addEventListener("pointerenter", () => clearTimeout(t));
      el.addEventListener("pointerleave", arm);
      box.append(el);
      tips.set(el, close);
      arm();
      return close;
    },

    /** lib/promoter.ts: the third mouse click on a shortcut earns one tip, remembered per key this session. */
    promote(keys, what) {
      if (!keys) return false;
      const done = told();
      if (done.includes(keys)) return false;
      const n = (clicks.get(keys) || 0) + 1;
      clicks.set(keys, n);
      if (n < TIP_AFTER) return false;
      try {
        sessionStorage.setItem(TOLD, JSON.stringify([...done, keys]));
      } catch {
        /* a private window; told for this page view only */
      }
      flux.tip(`Tip: ${keys}`, `${what || "This"} has a shortcut: ${keys}.`);
      return true;
    },

    /** Clipboard with the app's 1400ms "Copied" relabel; on failure selects fallbackEl's text. */
    async copy(text, button, fallbackEl) {
      try {
        await navigator.clipboard.writeText(text);
        if (button) relabelFor(button, "Copied", 1400);
        return true;
      } catch {
        if (fallbackEl) {
          const sel = getSelection();
          const range = document.createRange();
          range.selectNodeContents(fallbackEl);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        if (button) relabelFor(button, "Select and copy", 1400);
        return false;
      }
    },

    /**
     * The timeline: <i> bars (height = max(2, count/peak*height), --i, data-label) and, with p95/fail,
     * the two polylines in <svg class="tl-lines">. Replaces the track's bars and lines; returns the bars.
     * label(i, count) overrides the app's "10:42 · 92 requests · p95 8,900 ms · 41.0% failed".
     */
    bars(track, { counts, p95, fail, spike, height = 56, label } = {}) {
      if (!track || !counts) return [];
      for (const old of track.querySelectorAll(":scope > i, :scope > .tl-lines")) old.remove();
      const peak = Math.max(...counts, 1);
      const [h0, m0] = flux.SERIES.start.split(":").map(Number);
      const text =
        label ||
        ((i, c) => {
          const m = h0 * 60 + m0 + i;
          const parts = [`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, `${num(c)} requests`];
          if (p95 && p95[i] != null) parts.push(`p95 ${num(Math.round(p95[i]))} ms`);
          if (fail && fail[i]) parts.push(`${fail[i].toFixed(1)}% failed`);
          return parts.join(" · ");
        });
      const made = counts.map((c, i) => {
        const b = document.createElement("i");
        b.style.height = `${Math.max(2, (c / peak) * height)}px`;
        b.style.setProperty("--i", i);
        if (spike && i >= spike[0] && i <= spike[1]) b.className = "spike";
        b.dataset.label = text(i, c);
        return b;
      });
      track.append(...made);
      if (p95 || fail) {
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("class", "tl-lines");
        svg.setAttribute("viewBox", `0 0 ${counts.length} 56`);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.setAttribute("aria-hidden", "true");
        const line = (values, max, cls) => {
          const p = document.createElementNS(NS, "polyline");
          p.setAttribute("class", cls);
          p.setAttribute("points", values.map((v, i) => `${i + 0.5},${(56 - (v / max) * 56).toFixed(1)}`).join(" "));
          svg.append(p);
        };
        if (p95) line(p95, Math.max(...p95, 1), "p95");
        if (fail) line(fail, 100, "fail");
        track.append(svg);
      }
      return made;
    },

    /** Scrolls to #id under the header bar (instantly under reduced motion) and focuses its h2, or the element. */
    go(id) {
      const el = document.getElementById(String(id).replace(/^#/, ""));
      if (!el) return;
      const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-h")) || 48;
      // on stacked layouts the stage is a sticky window above the chapters: land the target under it
      const stage = document.getElementById("stage");
      const under =
        stage && el.closest("#story") && !stage.contains(el) && matchMedia("(max-width: 1023px)").matches
          ? stage.getBoundingClientRect().height + 16
          : 0;
      const top = el.getBoundingClientRect().top + scrollY - bar - 16 - under;
      scrollTo({ top: Math.max(0, top), behavior: flux.reduced ? "auto" : "smooth" });
      const target = el.querySelector("h2[tabindex='-1']") || el;
      if (target === el && !el.hasAttribute("tabindex")) el.tabIndex = -1;
      target.focus({ preventScroll: true });
    },

    /** const s = flux.state("idle"); s.set("drag"); s.get(); s.on((next, prev) => {}) */
    state(initial) {
      let value = initial;
      const subs = new Set();
      return {
        get: () => value,
        set(next) {
          if (next === value) return;
          const prev = value;
          value = next;
          for (const fn of [...subs]) fn(next, prev);
        },
        on(fn) {
          subs.add(fn);
          return () => subs.delete(fn);
        },
      };
    },

    // the demo hour: ERROR OR WARN per minute on POST /v1/charges, 10:00 to 11:00. Never edit; never recompute.
    SERIES: Object.freeze({
      counts: Object.freeze([
        14, 12, 16, 13, 15, 14, 12, 17, 15, 13, 16, 14, 15, 18, 14, 16, 15, 13, 17, 16, 15, 18, 14, 16, 19, 15, 17, 16, 15, 20, 16, 18, 15, 19, 17,
        18, 21, 17, 19, 18, 22, 71, 92, 64, 27, 26, 28, 25, 27, 29, 26, 27, 24, 27, 26, 15, 13, 12, 14, 11,
      ]),
      p95: Object.freeze([
        200, 225, 250, 275, 300, 200, 225, 250, 275, 300, 200, 225, 250, 275, 300, 200, 225, 250, 275, 300, 200, 225, 250, 275, 300, 200, 225, 250,
        275, 300, 200, 225, 250, 275, 300, 200, 225, 250, 310, 340, 420, 8400, 8900, 8600, 2300, 2410, 2280, 2350, 2190, 2420, 2310, 2270, 2380, 2250,
        2330, 212, 205, 198, 210, 201,
      ]),
      fail: Object.freeze([
        0.4, 0.8, 0.3, 1.1, 0.6, 0.4, 0.8, 0.3, 1.1, 0.6, 0.4, 0.8, 0.3, 1.1, 0.6, 0.4, 0.8, 0.3, 1.1, 0.6, 0.4, 0.8, 0.3, 1.1, 0.6, 0.4, 0.8, 0.3,
        1.1, 0.6, 0.4, 0.8, 0.3, 1.1, 0.6, 0.4, 0.8, 0.3, 1.4, 2.1, 4.6, 38.0, 41.0, 36.4, 29.1, 27.4, 30.2, 26.8, 28.5, 29.9, 27.1, 28.8, 26.3, 28.0,
        27.6, 0.6, 0.4, 0.3, 0.5, 0.4,
      ]),
      start: "10:00",
      spike: Object.freeze([41, 43]),
      merges: Object.freeze([
        Object.freeze({ at: 38, label: "#412 retry provider calls", time: "10:38" }),
        Object.freeze({ at: 55, label: "#418 retry only on connect errors", time: "10:55" }),
      ]),
    }),
  };

  // the promoter's memory: per key, per session
  const TIP_AFTER = 3;
  const TOLD = "flux.told";
  const clicks = new Map();
  const tips = new Map();
  const told = () => {
    try {
      const v = JSON.parse(sessionStorage.getItem(TOLD) || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  // the third mouse click on a [data-tip-key] (detail is 0 for a keyboard press, which needs no telling)
  document.addEventListener(
    "click",
    (e) => {
      const el = e.detail > 0 && e.target && e.target.closest ? e.target.closest("[data-tip-key]") : null;
      if (el && !el.matches(":disabled")) flux.promote(el.dataset.tipKey, el.dataset.tipWhat);
    },
    true,
  );

  motion.addEventListener("change", (e) => (flux.reduced = e.matches));
  document.addEventListener("visibilitychange", () => {
    flux.paused = document.hidden;
    flux.emit("visibility", { paused: flux.paused });
  });

  // past the story the readout is the footer's; before any chapter, the hero's
  const foot = document.getElementById("foot");
  if (foot) io.observe(foot);
  setTimeout(() => {
    if (!active && flux.island && document.getElementById("story")) flux.island.readout("10:41", "The spike");
  }, 0);

  window.flux = flux;
})();

// ==== the header: the island under the notch, "On this page", Search Everywhere (§3) ====
(() => {
  const top = document.getElementById("top");
  const island = document.getElementById("island");
  if (!top || !island || !window.flux) return;
  const F = window.flux;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };
  const landing = !!document.getElementById("story");
  const INSET = 48; // the pill: where the card hangs from
  const REACH = 28; // how near counts as near, past the island's edge

  const pill = $("island-pill");
  const card = $("island-card");
  const rowsEl = $("island-rows");
  const headEl = $("island-headline");
  const subEl = $("island-sub");
  const live = $("island-live");
  const dot = island.querySelector(".island-dot");
  const headDot = island.querySelector(".ih .dot");
  const count = island.querySelector(".island-count");
  const digits = island.querySelector(".digits");
  const labelEl = island.querySelector(".island-label");
  const srEl = island.querySelector(".island-sr");
  const muteBtn = $("island-mute");
  const pinBtn = $("island-pin");
  const foldBtn = $("island-fold");
  const mutedBox = $("island-muted");
  const unmuteBtn = $("island-unmute");
  const index = $("island-index");

  // ---- lib/island.ts, ported: CHIP, ORDER, ago(), headline(), lead()
  const CHIP = {
    running: ["running", "#e5a33a"],
    following: ["following", "#5fb865"],
    alert: ["new matches", "#e5534b"],
    quiet: ["gone quiet", "#e5534b"],
    watching: ["watching", "#4b8ef0"],
    mcp: ["MCP call", "#d97757"],
    update: ["update", "#a371f7"],
    deploy: ["deploy", "#3fb9c6"],
    regressed: ["errors up", "#e5534b"],
    done: ["done", "#5fb865"],
    failed: ["failed", "#e5534b"],
  };
  const ORDER = ["alert", "regressed", "failed", "quiet", "running", "deploy", "done", "mcp", "update", "following", "watching"];
  const WORDS = {
    alert: "with new matches",
    quiet: "gone quiet",
    running: "running",
    mcp: "MCP call",
    update: "update ready",
    deploy: "deploy on radar",
    regressed: "deploy with errors up",
    done: "command done",
    failed: "command failed",
    following: "following",
    watching: "watching",
  };
  const colour = (s) => `var(--chip-${s}, ${CHIP[s][1]})`;
  const ago = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
  };
  const headline = (items) =>
    ORDER.map((s) => [s, items.filter((i) => i.state === s).length])
      .filter(([, n]) => n)
      .map(([s, n]) => (s === "update" ? WORDS[s] : `${n} ${WORDS[s]}`))
      .join(" · ");
  const lead = (items) => ORDER.find((s) => items.some((i) => i.state === s)) || "watching";

  // ---- the readout: digits that roll, a label that cross-fades
  const roll = el("span", "roll");
  const line1 = el("span");
  const line2 = el("span");
  roll.append(line1, line2);
  digits.append(roll);
  const labelA = el("span", "cur");
  const labelB = el("span");
  labelEl.append(labelA, labelB);
  let clock = "";
  let label = "";
  let labelCur = labelA;
  let rollT = 0;
  const rollTo = (c) => {
    clearTimeout(rollT);
    if (F.reduced || !clock || !c) {
      line1.textContent = c;
      line2.textContent = "";
      roll.classList.remove("go");
      return;
    }
    line2.textContent = c;
    roll.classList.add("go");
    rollT = setTimeout(() => {
      roll.classList.add("snap");
      roll.classList.remove("go");
      line1.textContent = c;
      line2.textContent = "";
      void roll.offsetHeight;
      roll.classList.remove("snap");
    }, 260);
  };
  let fadeT = 0;
  const fadeTo = (l) => {
    const prev = labelCur;
    const next = prev === labelA ? labelB : labelA;
    next.textContent = l;
    next.classList.add("cur");
    prev.classList.remove("cur");
    labelCur = next;
    // the faded-out span is emptied once it is gone, or the stack stays as wide as the longer of the two
    clearTimeout(fadeT);
    fadeT = setTimeout(() => (prev.textContent = ""), F.reduced ? 0 : 180);
  };
  const readoutText = () => (clock ? `${clock} · ${label}` : label);
  const pillLabel = () => {
    const list = rows();
    const h = muted ? "muted" : list.length ? headline(list) : "";
    pill.setAttribute("aria-label", h ? `${readoutText()} — ${h}` : readoutText());
  };
  const readout = (c, l) => {
    c = c == null ? "" : String(c);
    l = l == null ? "" : String(l);
    if (c !== clock) rollTo(c);
    clock = c;
    if (l !== label) fadeTo(l);
    label = l;
    srEl.textContent = c;
    pillLabel();
  };

  // ---- the rows
  const items = new Map();
  const rows = () => [...items.values()].sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
  let muted = false;
  let pinned = false;
  let now = Date.now();
  const rowEl = () => {
    const b = el("button", "ir");
    b.type = "button";
    b.setAttribute("role", "listitem");
    b.tabIndex = -1;
    const box = el("div");
    box.append(el("span", "title"), el("span", "mono"));
    b.append(el("i"), box, el("span", "chip"), el("span", "ago"));
    return b;
  };
  const fillAgo = (b, i) => {
    b.children[3].textContent = i.at ? ago(now - i.at) : i.state === "update" ? "" : "now";
  };
  const fill = (b, i) => {
    const c = colour(i.state);
    b.children[0].style.background = c;
    b.children[1].children[0].textContent = i.title;
    b.children[1].children[1].textContent = i.detail;
    b.children[2].textContent = CHIP[i.state][0];
    b.children[2].style.color = c;
    b.children[2].style.background = `color-mix(in srgb, ${c} 18%, transparent)`;
    fillAgo(b, i);
  };
  // one polite region, written at most once per 800ms
  let pending = "";
  let lastSaid = -1e9;
  let sayT = 0;
  const say = () => {
    sayT = 0;
    lastSaid = performance.now();
    if (live.textContent !== pending) live.textContent = pending;
  };
  const announce = (text) => {
    pending = text;
    if (sayT) return;
    const wait = 800 - (performance.now() - lastSaid);
    if (wait <= 0) say();
    else sayT = setTimeout(say, wait);
  };
  const render = () => {
    const list = rows();
    const n = list.length;
    const c = colour(lead(list));
    // nothing going on: a still grey dot and no count, as the app has nothing to show then
    island.classList.toggle("idle", n === 0);
    dot.style.background = muted || n === 0 ? "#8e8e93" : c;
    headDot.style.background = c;
    count.style.color = c;
    count.textContent = String(n);
    const h = n ? headline(list) : "Nothing going on";
    headEl.textContent = h;
    subEl.textContent = `${n} ${n === 1 ? "thing" : "things"} going on in Flux`;
    const have = new Map([...rowsEl.children].map((b) => [b.dataset.key, b]));
    list.forEach((i, idx) => {
      let b = have.get(i.key);
      if (!b) {
        b = rowEl();
        b.dataset.key = i.key;
        b.style.transitionDelay = `${160 + idx * 40}ms`;
      }
      have.delete(i.key);
      fill(b, i);
      if (rowsEl.children[idx] !== b) rowsEl.insertBefore(b, rowsEl.children[idx] || null);
    });
    have.forEach((b) => b.remove());
    rove();
    announce(h);
    pillLabel();
    F.emit?.("island", { rows: list });
  };
  // the "ago" column ticks while the card is open, and rests while the tab is hidden
  let tick = 0;
  const ticking = (on) => {
    clearInterval(tick);
    tick = 0;
    if (!on) return;
    tick = setInterval(() => {
      now = Date.now();
      for (const b of rowsEl.children) {
        const i = items.get(b.dataset.key);
        if (i) fillAgo(b, i);
      }
    }, 1000);
  };
  document.addEventListener("visibilitychange", () => ticking(!document.hidden && state() === "open"));

  // ---- the shape: pill | near | open
  const state = () => island.dataset.state;
  let scrollAt = 0;
  let awayT = 0;
  const onScroll = () => {
    if (!pinned && Math.abs(window.scrollY - scrollAt) > 40) close();
  };
  const settle = (e) => {
    if (e.target !== island || e.propertyName !== "height") return;
    if (state() === "open") island.style.height = "";
  };
  island.addEventListener("transitionend", settle);
  const open = () => {
    if (state() === "open") return;
    const from = island.offsetHeight;
    card.hidden = false;
    island.style.height = `${from}px`;
    const to = INSET + card.offsetHeight; // measured, so the spring has a height to go to
    island.dataset.state = "open";
    island.style.height = `${to}px`;
    if (F.reduced) island.style.height = "";
    pill.setAttribute("aria-expanded", "true");
    now = Date.now();
    rove();
    ticking(!document.hidden);
    scrollAt = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
  };
  const close = () => {
    if (state() !== "open") return;
    clearTimeout(awayT);
    awayT = 0;
    island.style.height = `${island.offsetHeight}px`;
    void island.offsetHeight;
    island.dataset.state = "pill";
    island.style.height = "";
    card.hidden = true;
    pill.setAttribute("aria-expanded", "false");
    ticking(false);
    window.removeEventListener("scroll", onScroll);
  };
  pill.addEventListener("click", () => (state() === "open" ? close() : open()));
  foldBtn.addEventListener("click", () => {
    close();
    pill.focus();
  });
  // near: a pointer (never a touch) within REACH of the island; an open card nobody pinned folds 1.2s after the pointer left it
  const near = (e) => {
    const r = island.getBoundingClientRect();
    return e.clientX > r.left - REACH && e.clientX < r.right + REACH && e.clientY < r.bottom + REACH;
  };
  document.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "touch") return;
      const inside = near(e);
      if (state() === "open") {
        if (inside) {
          clearTimeout(awayT);
          awayT = 0;
        } else if (!awayT && !pinned) {
          awayT = setTimeout(() => {
            awayT = 0;
            close();
          }, 1200);
        }
        return;
      }
      const want = inside ? "near" : "pill";
      if (state() !== want) island.dataset.state = want;
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => {
    if (state() === "near") island.dataset.state = "pill";
  });
  document.addEventListener("pointerdown", (e) => {
    if (state() === "open" && !pinned && !island.contains(e.target)) close();
  });
  F.onKey?.("escape", () => {
    if (state() !== "open") return false;
    close();
    pill.focus();
    return false;
  });

  // ---- the card's controls
  muteBtn.addEventListener("click", () => {
    muted = true;
    island.classList.add("muted");
    mutedBox.hidden = false;
    island.style.height = "";
    render();
    unmuteBtn.focus();
  });
  unmuteBtn.addEventListener("click", () => {
    muted = false;
    island.classList.remove("muted");
    mutedBox.hidden = true;
    island.style.height = "";
    render();
    muteBtn.focus();
  });
  pinBtn.addEventListener("click", () => {
    pinned = !pinned;
    pinBtn.setAttribute("aria-pressed", String(pinned));
    pinBtn.setAttribute("aria-label", pinned ? "Let the island fold" : "Keep the island open");
    pinBtn.querySelector("use").setAttribute("href", pinned ? "#i-pin-off" : "#i-pin");
    pinBtn.style.color = pinned ? "#4b8ef0" : "";
  });
  // ↑↓ through the rows and the index (one tab stop), Home/End jump
  const roving = () => [...card.querySelectorAll(".ir, .ix")].filter((b) => b.offsetParent !== null);
  const rove = () => {
    const list = roving();
    const has = list.some((b) => b.tabIndex === 0);
    list.forEach((b, n) => {
      if (!has) b.tabIndex = n ? -1 : 0;
    });
  };
  card.addEventListener("keydown", (e) => {
    const list = roving();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    let n;
    if (e.key === "ArrowDown") n = Math.min(list.length - 1, i + 1);
    else if (e.key === "ArrowUp") n = Math.max(0, i < 0 ? 0 : i - 1);
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = list.length - 1;
    else return;
    e.preventDefault();
    list.forEach((b) => (b.tabIndex = -1));
    list[n].tabIndex = 0;
    list[n].focus();
  });
  rowsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".ir");
    if (!b) return;
    const k = b.dataset.key;
    if (/^(watch|deploy):/.test(k)) F.go?.("watch");
    else if (k.startsWith("mcp:")) F.go?.("claude");
    if (!pinned) close();
  });
  index.addEventListener("click", (e) => {
    const a = e.target.closest(".ix");
    if (!a || !landing || !F.go) return; // elsewhere they are plain links to /#id
    e.preventDefault();
    if (!pinned) close();
    F.go(a.getAttribute("href").split("#")[1]);
  });
  if (landing) {
    F.on?.("chapter", (d) => {
      if (!d) return;
      for (const a of index.querySelectorAll(".ix")) a.classList.toggle("cur", a.getAttribute("href") === `/#${d.id}`);
      if (d.clock != null || d.label != null) readout(d.clock, d.label);
    });
  }

  // ---- flux.island
  F.island = {
    set(key, row) {
      if (!key || !row) return;
      const state = CHIP[row.state] ? row.state : "watching";
      const was = items.get(key) || {};
      items.set(key, {
        key,
        title: row.title == null ? was.title || "" : String(row.title),
        detail: row.detail == null ? was.detail || "" : String(row.detail),
        state,
        at: row.at == null ? was.at : row.at,
      });
      now = Date.now();
      render();
    },
    clear(key) {
      if (items.delete(key)) render();
    },
    rows,
    readout: landing ? readout : () => {}, // a document's readout is its title; the chapters' footer entry never rewrites it
    open,
    close,
  };

  // ---- the page this is: the story, or a document
  if (landing) readout("10:41", "The spike");
  else {
    island.classList.add("plain");
    const h1 = document.querySelector("main h1");
    readout("", h1 ? h1.textContent.trim().replace(/\.$/, "") : "Nothing here");
  }
  render();

  // ---- the bar: transparent at the top, glass once the sentinel scrolled away; never hidden
  const sentinel = $("top-sentinel");
  if (sentinel && "IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => top.classList.toggle("scrolled", !e.isIntersecting), { threshold: 0 }).observe(sentinel);
  }
  F.latest?.then?.((v) => {
    const dl = $("top-download");
    if (v && v.version && dl) dl.title = `Flux ${v.version}`;
  });

  // ---- Search Everywhere (§3.5)
  const se = $("se");
  const input = $("se-input");
  const listEl = $("se-list");
  const countEl = $("se-count");
  if (!se || !input || !listEl || typeof se.showModal !== "function") return;
  const tabs = [...se.querySelectorAll(".stabs [role=tab]")];
  const go = (id) => (F.go ? F.go(id) : (location.href = `/#${id}`));
  const XATTR = "xattr -dr com.apple.quarantine /Applications/Flux.app";
  const CHAPTERS = [
    [
      "hero",
      "10:41",
      "The spike",
      "Flux is an IDE for logs on your Mac — Graylog, Elasticsearch through Kibana, or the log files and containers you already have.",
    ],
    ["explain", "10:43", "Why this stretch?", "The timeline already shows where."],
    ["trace", "10:44", "One request, every service", "Take the id from the failing line."],
    ["case", "10:46", "The case", "Right-click the line and choose Investigate."],
    ["claude", "10:51", "Handed to the terminal", "The case lands in the terminal where Claude Code runs, with a brief."],
    ["watch", "10:58", "Keep an eye on it", "Save the query, right-click it, Watch for new matches."],
    ["ran", "11:02", "Where this ran", "Flux talks to Graylog, Kibana or your files from your Mac."],
    ["download", "11:02", "All clear", "Free and open source, under the Apache License 2.0."],
  ].map(([id, clock, title, sub]) =>
    landing ? { title, sub, keys: id, trailing: clock, run: () => go(id) } : { title, sub, keys: id, trailing: clock, href: `/#${id}` },
  );
  const DOCS = [
    ["introduction", "Introduction", "What Flux is, and what it is for."],
    ["install", "Install", "Download Flux, open it once, and let it update itself from then on."],
    ["connections", "Connections", "Graylog, Elasticsearch through Kibana, or files and containers on your Mac."],
    ["search", "Search", "The console, the result grid, saved queries and Search Everywhere."],
    ["explain", "Explain a spike", "Which version, service, host or route a spike comes from."],
    ["trace", "Trace an ID", "One request id, every service, in order."],
    ["watch", "Watch", "Be told when new matches arrive, or when they stop."],
    ["monitor", "Monitor", "A live dashboard of a connection's logs."],
    ["claude-code", "Claude Code and MCP", "Let an agent read your logs with Flux's own tools."],
    ["shortcuts", "Keyboard shortcuts", "The keys, as an IDE has them."],
    ["data", "Where your data lives", "What stays on your Mac, what syncs, and what reaches whom."],
  ].map(([slug, title, sub]) => ({ title, sub, href: `/docs/${slug}` }));
  const ACTIONS = landing
    ? [
        { title: "Download Flux for macOS", href: "/download" },
        {
          title: "Copy the install command",
          sub: XATTR,
          run: () => {
            const done = F.copy
              ? F.copy(XATTR)
              : navigator.clipboard
                ? navigator.clipboard.writeText(XATTR).then(() => true)
                : Promise.resolve(false);
            Promise.resolve(done)
              .then((ok) => ok && F.tip?.("Copied", XATTR))
              .catch(() => {});
          },
        },
        {
          title: "Trace “req_7f3a9c2e” across every stream",
          trailing: "⇧⌘I",
          run: () => {
            go("trace");
            F.emit?.("trace-open", { id: "req_7f3a9c2e" });
          },
        },
        {
          title: "Open the service map",
          trailing: "⇧⌘M",
          run: () => {
            go("trace");
            F.emit?.("map-open");
          },
        },
        {
          title: "Explain the spike",
          trailing: "⌥-drag",
          run: () => {
            go("explain");
            F.emit?.("explain-run");
          },
        },
        { title: "Enable the MCP server", run: () => F.emit?.("mcp", { on: true }) },
        { title: "Keyboard shortcuts", run: () => go("legend") },
      ]
    : [];
  const PAGES = [
    { title: "Privacy", href: "/privacy" },
    { title: "Terms", href: "/terms" },
    { title: "GitHub", href: "https://github.com/bozkurtemre/flux" },
    { title: "Changelog", href: "https://github.com/bozkurtemre/flux/releases" },
  ];
  const GROUPS = { Actions: [ACTIONS, "#i-zap"], Chapters: [CHAPTERS, "#i-chart"], Docs: [DOCS, "#i-book"], Pages: [PAGES, "#i-link"] };
  const TAB = { all: ["Actions", "Chapters", "Docs", "Pages"], chapters: ["Chapters"], docs: ["Docs"], actions: ["Actions"] };
  let tab = "all";
  let hits = [];
  let sel = 0;
  let opener = null;

  const mark = () => {
    const rowsNow = listEl.querySelectorAll(".srow");
    rowsNow.forEach((r, n) => {
      r.classList.toggle("sel", n === sel);
      r.setAttribute("aria-selected", String(n === sel));
    });
    const cur = rowsNow[sel];
    if (cur) {
      input.setAttribute("aria-activedescendant", cur.id);
      cur.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  };
  const draw = () => {
    listEl.replaceChildren();
    if (!hits.length) {
      const p = el("p", "se-empty");
      const q = input.value.trim();
      p.textContent = q ? `Nothing matches “${q}”` : "Type to search";
      listEl.append(p);
    }
    let group = "";
    hits.forEach((h, n) => {
      if (h.group !== group) {
        group = h.group;
        const g = el("div", "sgroup");
        g.textContent = group;
        listEl.append(g);
      }
      const r = el(h.href ? "a" : "button", "srow");
      if (h.href) r.href = h.href;
      else r.type = "button";
      r.id = `se-r${n}`;
      r.setAttribute("role", "option");
      r.dataset.n = n;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", GROUPS[h.group][1]);
      svg.setAttribute("aria-hidden", "true");
      svg.append(use);
      const t = el("span", "st");
      t.textContent = h.title;
      r.append(svg, t);
      if (h.sub) {
        const s = el("span", "ssub");
        s.textContent = h.sub;
        r.append(s);
      }
      if (h.trailing) {
        const s = el("span", "right");
        s.textContent = h.trailing;
        r.append(s);
      }
      listEl.append(r);
    });
    countEl.textContent = `${hits.length} result${hits.length === 1 ? "" : "s"}`;
    mark();
  };
  const search = () => {
    const q = input.value.trim().toLowerCase();
    hits = [];
    for (const g of q ? TAB[tab] : tab === "all" ? ["Actions", "Chapters"] : TAB[tab]) {
      const src = GROUPS[g][0];
      const found = q ? src.filter((r) => `${r.title} ${r.sub || ""} ${r.keys || ""}`.toLowerCase().includes(q)).slice(0, 8) : src.slice(0, 3);
      for (const r of found) hits.push({ ...r, group: g });
    }
    sel = 0;
    draw();
  };
  const setTab = (next) => {
    tab = next;
    tabs.forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    search();
  };
  const choose = (h) => {
    if (!h) return;
    se.close();
    if (h.href) location.href = h.href;
    else h.run?.();
  };
  const openSE = (from) => {
    if (se.open) return;
    opener = from && typeof from.focus === "function" ? from : document.activeElement;
    close();
    input.value = "";
    setTab("all");
    se.showModal();
    input.focus();
  };
  se.addEventListener("close", () => {
    const o = opener;
    opener = null;
    // a chosen row may have moved the focus already (flux.go focuses the chapter's h2): only an orphaned focus returns
    const a = document.activeElement;
    if (a && a !== document.body && !se.contains(a)) return;
    if (o && o.isConnected && o !== document.body && o.offsetParent !== null) o.focus();
    else pill.focus();
  });
  se.addEventListener("click", (e) => {
    if (e.target === se) return se.close(); // the backdrop
    const r = e.target.closest(".srow");
    if (!r) return;
    e.preventDefault();
    choose(hits[+r.dataset.n]);
  });
  listEl.addEventListener("mousemove", (e) => {
    const r = e.target.closest(".srow");
    if (r && +r.dataset.n !== sel) {
      sel = +r.dataset.n;
      mark();
    }
  });
  tabs.forEach((b) =>
    b.addEventListener("click", () => {
      setTab(b.dataset.tab);
      input.focus();
    }),
  );
  input.addEventListener("input", search);
  se.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const order = Object.keys(TAB);
      setTab(order[(order.indexOf(tab) + (e.shiftKey ? order.length - 1 : 1)) % order.length]);
      input.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      sel = e.key === "ArrowDown" ? Math.min(hits.length - 1, sel + 1) : Math.max(0, sel - 1);
      mark();
    } else if (e.key === "Enter" && e.target === input) {
      e.preventDefault();
      choose(hits[sel]);
    }
  });
  // the openers: ⇧⇧, ⌘K / Ctrl+K, anything marked data-se-open, the island card's row
  F.onKey?.("shift shift", () => {
    openSE();
    return false;
  });
  F.onKey?.("meta+k", () => {
    openSE();
    return true;
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-se-open], #island-search");
    if (!b) return;
    e.preventDefault();
    openSE(b);
  });
})();

// ==== hero ====
// hero: the stage (flux.stage), the spike scene's S0–S3, the hero text's buttons
(() => {
  const el = document.getElementById("hero");
  const stage = document.getElementById("stage");
  if (!el || !stage || !window.flux) return;
  const F = window.flux;
  const NS = "http://www.w3.org/2000/svg";
  const $ = (sel, root = stage) => root.querySelector(sel);
  const num = (n) => n.toLocaleString("en-US");
  const h = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const svgUse = (href) => {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(NS, "use");
    use.setAttribute("href", href);
    svg.append(use);
    return svg;
  };

  // ---- flux.stage
  const editor = $("#stage-editor");
  const frame = $(".frame");
  let fade = 0;
  let auto = null;
  const stageApi = {
    el: stage,
    /** Fades the editor out over 160ms, swaps the scene, fades it in over 240ms; at once under reduced motion. */
    setScene(name) {
      clearTimeout(fade);
      const swap = () => {
        stage.dataset.scene = name;
        F.emit("scene", { name });
      };
      if (stage.dataset.scene === name) {
        editor.style.transition = "";
        editor.style.opacity = "";
        return;
      }
      if (F.reduced) {
        editor.style.transition = "";
        editor.style.opacity = "";
        swap();
        return;
      }
      editor.style.transition = "opacity 160ms";
      editor.style.opacity = "0";
      fade = setTimeout(() => {
        swap();
        editor.style.transition = "opacity 240ms";
        editor.style.opacity = "1";
        fade = setTimeout(() => {
          editor.style.transition = "";
          editor.style.opacity = "";
        }, 240);
      }, 160);
    },
    scene: () => stage.dataset.scene,
    touched: false,
    /** Calls fn once after ms unless the stage was touched or the chapter changed; never under reduced motion. */
    autoplay(fn, ms = 3500) {
      stageApi.cancel();
      if (F.reduced) return () => {};
      // registered from a chapter's enter(): that chapter becomes current right after enter returns
      let chapter = F.chapters.current;
      queueMicrotask(() => (chapter = F.chapters.current));
      const t = setTimeout(() => {
        auto = null;
        if (!stageApi.touched && F.chapters.current === chapter) fn();
      }, ms);
      auto = () => clearTimeout(t);
      return stageApi.cancel;
    },
    cancel() {
      if (auto) auto();
      auto = null;
    },
  };
  F.stage = stageApi;
  const inAct = (t) => {
    const c = F.chapters.current;
    const act = c && c.el && c.el.querySelector(".act");
    return !!(act && t && act.contains(t));
  };
  const touch = (e) => {
    if (!(e.target instanceof Node)) return;
    if (stage.contains(e.target) || inAct(e.target)) {
      stageApi.touched = true;
      stageApi.cancel();
    }
  };
  document.addEventListener("pointerdown", touch, true);
  document.addEventListener("keydown", touch, true);

  // the two slots other builders write, through events only
  const rowsEl = $("#stage-rows");
  const mcpEl = $("#stage-mcp");
  F.on("status", (text) => {
    if (rowsEl) rowsEl.textContent = text == null ? "" : String(text);
  });
  F.on("mcp", (d) => {
    if (mcpEl) mcpEl.classList.toggle("on", !!(d && d.on));
  });

  // the tree: rows only move the selection
  const tree = $(".hero-tree");
  if (tree) {
    tree.addEventListener("click", (e) => {
      const b = e.target.closest(".row");
      if (!b) return;
      for (const r of tree.querySelectorAll(".row")) {
        r.classList.toggle("sel", r === b);
        if (r === b) r.setAttribute("aria-current", "true");
        else r.removeAttribute("aria-current");
      }
    });
  }

  // ---- the hero text
  const play = $("#hero-play", el);
  if (play) play.addEventListener("click", () => F.go("explain"));
  F.latest.then((v) => {
    if (!v || !v.version) return;
    const label = $("#hero-download span", el);
    if (label) label.textContent = `Download Flux ${v.version}`;
    const slot = $("#hero-version", el);
    if (slot) slot.textContent = `v${v.version} · `;
  });

  // ---- scene: spike
  const scene = $('.scene[data-scene="spike"]');
  if (!scene) return;
  const run = $(".run", scene);
  const tab = $(".tab.active", scene);
  const code = $(".code", scene);
  const typedin = $(".typedin", scene);
  const select = $(".select", scene);
  const rangeText = [...select.childNodes].find((n) => n.nodeType === 3);
  const count = $(".tl-count", scene);
  const track = $("[data-bars]", scene);
  const grid = $(".grid", scene);
  const rows = [...grid.querySelectorAll(".tr")];
  const gfoot = [...$(".gfoot", scene).children];
  const pager = $(".gfoot .pager span", scene);
  const explorerCount = $(".hero-count");
  const S = F.SERIES;
  const TOTAL = 1244;
  const BY_HOST = { "payments-2": 1031, "payments-1": 213 };
  const COLS = ["timestamp", "host", "level", "message"];
  const cellOf = (tr, col) => tr.querySelector(`[data-col="${col}"]`) || tr.children[COLS.indexOf(col) + 1];
  const valOf = (tr, col) => cellOf(tr, col).textContent;

  const timers = new Set();
  const later = (ms, fn) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };
  let cancels = [];
  let press = 0;
  const stop = () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    clearTimeout(press);
    for (const c of cancels) c();
    cancels = [];
  };

  // the marker, the roles and each row's ⋯
  const marker = h("span", "marker");
  marker.style.left = "64.17%";
  marker.setAttribute("aria-hidden", "true");
  const handle = h("b");
  handle.title = "#412 retry provider calls · 10:38";
  marker.append(handle);
  track.append(marker);
  const head = $(".hd", grid);
  head.setAttribute("role", "row");
  for (const c of head.children) c.setAttribute("role", "columnheader");
  rows.forEach((tr, i) => {
    tr.setAttribute("role", "row");
    for (const c of tr.children) c.setAttribute("role", "gridcell");
    tr.style.setProperty("--i", i);
    const more = h("button", "hero-more");
    more.type = "button";
    more.tabIndex = -1;
    more.setAttribute("aria-label", `Actions for line ${i + 1}`);
    more.append(svgUse("#i-more"));
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      openMenu(tr, more);
    });
    tr.append(more);
  });

  // ---- the drawn Search Everywhere (S0–S1)
  let veil = null;
  let dialog = null;
  const RESULTS = [
    [
      "Endpoints",
      [
        ["#i-ep", "ico bad", "mono", "POST /v1/charges", "payments", "acme", true],
        ["#i-ep", "ico", "mono", "GET /v1/charges/{id}", "payments", "acme"],
      ],
    ],
    ["Queries", [["#i-history", "ico", "mono", 'message:"Charge failed"', "payments", "42 rows"]]],
    ["Actions", [["#i-zap", "ico", "", "Trace “charge” across every stream", "", ""]]],
  ];
  const srow = ([icon, ico, mono, title, sub, right, sel]) => {
    const r = h("div", sel ? "srow sel" : "srow");
    const i = h("span", ico);
    i.append(svgUse(icon));
    r.append(i, h("span", mono, title));
    if (sub) r.append(h("span", "ssub", sub));
    if (right) r.append(h("span", "right", right));
    return r;
  };
  const overlay = () => {
    veil = h("div", "veil hero-veil");
    veil.setAttribute("aria-hidden", "true");
    veil.addEventListener("click", runQuery);
    dialog = h("div", "dialog se-stage");
    dialog.setAttribute("aria-hidden", "true");
    const stabs = h("div", "stabs");
    for (const t of ["All", "Projects", "Streams", "Endpoints", "Queries", "Actions"]) stabs.append(h("span", t === "All" ? "active" : "", t));
    const sinput = h("div", "sinput");
    const typed = h("span", "typed");
    // the caret rides on the last letter: the input's flex gap must not come between them
    const field = h("span", "");
    field.append(typed, h("span", "caret"));
    sinput.append(svgUse("#i-search"), field);
    const res = h("div", "hero-sres");
    const foot = h("div", "hero-sfoot");
    const found = h("span", "right");
    foot.append(h("span", "", "↑↓ navigate ↵ open ⇥ switch tab esc close"), found);
    dialog.append(stabs, sinput, res, foot);
    frame.append(veil, dialog);
    return { typed, res, found };
  };
  const killOverlay = () => {
    if (veil) veil.remove();
    if (dialog) dialog.remove();
    veil = dialog = null;
  };
  const closeOverlay = () => {
    if (!dialog) return;
    if (F.reduced) return killOverlay();
    veil.classList.add("hero-out");
    dialog.classList.add("hero-out");
    later(160, killOverlay);
  };
  const start = () => {
    const { typed, res, found } = overlay();
    cancels.push(
      F.typewriter(typed, "charge", {
        cps: 12,
        done: () => {
          let n = 0;
          for (const [group, items] of RESULTS) {
            const first = n;
            later(first * 120, () => res.append(h("div", "sgroup", group)));
            for (const it of items) {
              const i = n++;
              later(i * 120, () => {
                res.append(srow(it));
                found.textContent = `${i + 1} results`;
              });
            }
          }
        },
      }),
    );
    later(2000, runQuery);
  };

  // ---- S2 run → S3 result
  // a one-shot flash that fades by itself: nothing is left lit if the chapter's timers are cancelled
  const lit = (n) => {
    if (F.reduced) return;
    n.classList.remove("hero-lit");
    void n.offsetWidth;
    n.classList.add("hero-lit");
  };
  const setFoot = (n, total, ms) => {
    gfoot[1].textContent = `${n} rows`;
    pager.textContent = `1–${n}`;
    gfoot[3].textContent = `total ${num(total)}`;
    gfoot[4].textContent = ms;
  };
  const drawBars = () =>
    F.bars(track, {
      counts: S.counts,
      p95: S.p95,
      fail: S.fail,
      spike: S.spike,
      height: track.clientHeight || 56,
    });
  function runQuery() {
    stop();
    closeOverlay();
    restore();
    lit(run);
    lit(code);
    F.island?.set("run:charges", {
      title: "POST /v1/charges",
      detail: "level:ERROR OR level:WARN",
      state: "running",
    });
    F.emit("status", "running…");
    explorerCount.classList.add("hero-hide");
    grid.classList.remove("hero-rise");
    grid.classList.add("hero-wait");
    track.classList.remove("hero-grow");
    for (const old of track.querySelectorAll(":scope > i, :scope > .tl-lines")) old.remove();
    count.textContent = "";
    if (F.reduced) result();
    else later(160, result);
  }
  const result = () => {
    track.classList.toggle("hero-grow", !F.reduced);
    drawBars();
    cancels.push(F.tween(0, TOTAL, 1400, (v) => (count.textContent = `${num(Math.round(v))} messages`)));
    explorerCount.classList.remove("hero-hide");
    grid.classList.remove("hero-wait");
    grid.classList.toggle("hero-rise", !F.reduced);
    F.emit("status", "1,244 rows · 214 ms");
    if (F.reduced) F.island?.clear("run:charges");
    else later(1400, () => F.island?.clear("run:charges"));
  };
  /** The S3 end state, at once: no overlay, bars and rows in place, nothing narrowed. */
  const showEnd = () => {
    stop();
    killOverlay();
    track.classList.remove("hero-grow");
    drawBars();
    grid.classList.remove("hero-wait", "hero-rise");
    explorerCount.classList.remove("hero-hide");
    restore();
    count.textContent = "1,244 messages";
    F.emit("status", "1,244 rows · 214 ms");
    F.island?.clear("run:charges");
  };

  // ---- the grid's menu and its narrowing
  let narrowed = false;
  let group = null;
  const type = (text) =>
    cancels.push(
      F.typewriter(typedin, text, {
        cps: Math.max(40, Math.ceil(text.length / 0.3)),
      }),
    );
  function restore() {
    if (!narrowed) return;
    narrowed = false;
    for (const c of cancels) c();
    cancels = [];
    typedin.textContent = "";
    for (const tr of rows) tr.hidden = false;
    grid.hidden = false;
    if (group) group.remove();
    group = null;
    for (const b of track.querySelectorAll(":scope > i")) b.classList.remove("hero-dim");
    rangeText.data = "Last 1 hour";
    setFoot(50, TOTAL, "214 ms");
    count.textContent = "1,244 messages";
    F.emit("status", "1,244 rows · 214 ms");
  }
  const narrow = (clause, keep, total) => {
    restore();
    narrowed = true;
    type(clause);
    for (const tr of rows) tr.hidden = !keep(tr);
    setFoot(rows.filter((tr) => !tr.hidden).length, total, "188 ms");
    count.textContent = `${num(total)} messages`;
    F.emit("status", `${num(total)} rows · 188 ms`);
  };
  const tally = (col) => {
    if (col === "host") return Object.entries(BY_HOST);
    const m = new Map();
    for (const tr of rows) m.set(valOf(tr, col), (m.get(valOf(tr, col)) || 0) + 1);
    return [...m];
  };
  const totalOf = (col, val) => (col === "host" ? BY_HOST[val] : tally(col).find(([k]) => k === val)[1]);
  const sumOf = (col) => (col === "host" ? TOTAL : rows.length);
  const groupBy = (col) => {
    restore();
    narrowed = true;
    type(` | group by ${col}`);
    const list = tally(col);
    const sum = list.reduce((a, [, n]) => a + n, 0);
    group = h("div", "hero-group");
    group.setAttribute("role", "table");
    group.setAttribute("aria-label", `Grouped by ${col}`);
    const cols = h("div", "xcols");
    cols.append(h("span", "", col), h("span", "", "count"), h("span", "", "share"));
    group.append(cols);
    for (const [k, n] of list) {
      const pct = Math.round((n / sum) * 100);
      const r = h("div", "xrow");
      const share = h("span", "share");
      const bar = h("i");
      const u = h("u");
      u.style.width = `${pct}%`;
      bar.append(u);
      share.append(bar, h("span", "", `${pct}%`));
      r.append(h("span", "", k), h("span", "", num(n)), share);
      group.append(r);
    }
    grid.hidden = true;
    grid.after(group);
    setFoot(list.length, list.length, "188 ms");
    count.textContent = `${num(sum)} messages`;
    F.emit("status", `${list.length} rows · 188 ms`);
  };
  const around = () => {
    restore();
    narrowed = true;
    rangeText.data = "10:40 – 10:45";
    track.querySelectorAll(":scope > i").forEach((b, i) => b.classList.toggle("hero-dim", i < 40 || i > 44));
  };
  const selectRow = (tr) => {
    for (const r of rows) r.classList.toggle("sel", r === tr);
  };
  const items = (tr, col) => {
    const val = valOf(tr, col);
    return [
      {
        label: "Investigate",
        icon: "#i-microscope",
        onClick: () => {
          F.go("case");
          F.emit("case-open");
        },
      },
      { separator: true },
      {
        label: "Follow this request",
        icon: "#i-route",
        disabled: !tr.dataset.id,
        onClick: () => {
          F.go("trace");
          F.emit("trace-open", { id: tr.dataset.id, run: true });
        },
      },
      { separator: true },
      {
        label: `Filter by ${col}`,
        icon: "#i-filter",
        onClick: () => narrow(` AND ${col}:"${val}"`, (r) => valOf(r, col) === val, totalOf(col, val)),
      },
      {
        label: `Exclude ${col}`,
        icon: "#i-filter-x",
        onClick: () => narrow(` AND NOT ${col}:"${val}"`, (r) => valOf(r, col) !== val, sumOf(col) - totalOf(col, val)),
      },
      {
        label: `Group by ${col}`,
        icon: "#i-rows",
        onClick: () => groupBy(col),
      },
      {
        label: "Show 5 minutes around this",
        icon: "#i-clock",
        onClick: around,
      },
    ];
  };
  let menuClose = null;
  function openMenu(tr, at, col) {
    if (menuClose) menuClose();
    selectRow(tr);
    menuClose = F.menu(items(tr, col || "host"), {
      at: at || tr,
      within: frame,
      onClose: () => (menuClose = null),
    });
  }
  grid.addEventListener("contextmenu", (e) => {
    const tr = e.target.closest(".tr");
    if (!tr) return;
    e.preventDefault();
    if (menuClose) return;
    const cell = e.target.closest("[data-col]");
    openMenu(tr, e.detail > 0 || e.button === 2 ? { x: e.pageX, y: e.pageY } : tr, cell && cell.dataset.col);
  });
  grid.addEventListener("click", (e) => {
    const tr = e.target.closest(".tr");
    if (tr) selectRow(tr);
  });
  grid.addEventListener("keydown", (e) => {
    const tr = e.target.closest(".tr");
    if (!tr) return;
    const visible = rows.filter((r) => !r.hidden);
    const i = visible.indexOf(tr);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = visible[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) next.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectRow(tr);
    } else if ((e.shiftKey && e.key === "F10") || e.key === "ContextMenu") {
      e.preventDefault();
      openMenu(tr);
    }
  });
  // a long press (500ms, touch) opens the menu where the finger is
  grid.addEventListener("pointerdown", (e) => {
    const tr = e.target.closest(".tr");
    if (!tr || e.pointerType !== "touch") return;
    const { pageX, pageY } = e;
    clearTimeout(press);
    press = setTimeout(() => {
      if (!menuClose) openMenu(tr, { x: pageX, y: pageY });
    }, 500);
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) grid.addEventListener(ev, () => clearTimeout(press));
  grid.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" && (Math.abs(e.movementX) > 8 || Math.abs(e.movementY) > 8)) clearTimeout(press);
  });

  // ---- keys and buttons
  run.addEventListener("click", runQuery);
  F.onKey("meta+enter", () => {
    if (!dialog && !stage.contains(document.activeElement)) return false;
    runQuery();
    return true;
  });
  F.onKey("enter", () => {
    if (!dialog) return false;
    runQuery();
    return true;
  });
  F.onKey("escape", () => {
    if (!narrowed || document.querySelector("dialog[open]")) return false;
    restore();
    return true;
  });
  el.addEventListener("click", (e) => {
    const b = e.target.closest(".hero-hint");
    if (!b) return;
    const what = b.dataset.hint;
    if (what === "trace") {
      F.go("trace");
      F.emit("trace-open", {});
    } else if (what === "map") {
      F.go("trace");
      F.emit("map-open");
    } else if (what === "explain") {
      F.go("explain");
      F.emit("explain-run");
    } else if (what === "menu") {
      if (F.mobile()) F.go("stage");
      const open = () => {
        rows[0].focus({ preventScroll: true });
        openMenu(rows[0]);
      };
      if (stageApi.scene() === "spike") open();
      else {
        stageApi.setScene("spike");
        later(F.reduced ? 0 : 420, open);
      }
    }
  });

  // ---- the chapter and the load
  F.chapters.register(el, {
    clock: "10:41",
    label: "The spike",
    scene: "spike",
    enter: ({ first }) => {
      stageApi.setScene("spike");
      if (!first) showEnd();
    },
    leave: () => {
      if (timers.size || dialog) showEnd();
    },
  });
  F.on("visibility", (d) => {
    if (d && d.paused && (timers.size || dialog)) showEnd();
  });
  if (F.reduced) showEnd();
  else {
    grid.classList.add("hero-wait");
    explorerCount.classList.add("hero-hide");
    count.textContent = "";
    later(600, () => {
      const c = F.chapters.current;
      if (stageApi.touched || (c && c.id !== "hero")) showEnd();
      else start();
    });
  }
})();

// ==== explain ====
// explain — 10:43 · Why this stretch? An ⌥-drag across the spike opens the ExplainPanel; a plain drag
// writes the app's between clause; a row narrows the console. Mirrors Timeline.tsx and ExplainPanel.tsx.
(() => {
  const el = document.getElementById("explain");
  if (!el || !window.flux || !flux.stage) return;
  const scene = document.querySelector('.scene[data-scene="explain"]');
  if (!scene) return;

  const S = flux.SERIES;
  const [SPIKE_LO, SPIKE_HI] = S.spike;
  const N = S.counts.length;
  const $ = (sel, root = scene) => root.querySelector(sel);
  const track = $(".timeline");
  const typedin = $(".typedin");
  const countEl = $(".tl-count");
  const totalEl = $(".explain-total");
  const panel = $(".explain-panel");
  const spanEl = $(".explain-span");
  const spin = $(".spin");
  const nothing = $(".explain-nothing");
  const rowsBox = $(".explain-rows");
  const xrows = [...scene.querySelectorAll(".xrow")];
  const gridRows = [...scene.querySelectorAll(".grid .tr")];
  const ring = $(".explain-ring");
  const dragLabel = $(".explain-drag-label");
  const cursor = $(".explain-cursor");
  const live = $(".explain-live");
  const key = $(".explain-key", el);
  const runBtn = $(".explain-run", el);
  const done = $(".done", el);
  const act = $(".act", el);
  const stageEl = flux.stage.el || document.getElementById("stage");

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const order = (a, b) => (a <= b ? [a, b] : [b, a]);
  const num = (n) => n.toLocaleString("en-US");
  const [h0, m0] = S.start.split(":").map(Number);
  const tm = (i) => {
    const m = h0 * 60 + m0 + i;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };
  const span = (lo, hi) => `${tm(lo)} – ${tm(hi)}`;
  const latched = () => key.getAttribute("aria-pressed") === "true";
  const latch = (on) => key.setAttribute("aria-pressed", on ? "true" : "false");
  const isTyping = () => {
    const a = document.activeElement;
    return !!a && a.matches("input, textarea, select, [contenteditable=true]");
  };

  // ---- state: idle → (drag) → explained | nothing | narrowed → row; Escape, × and Reset return to idle ----
  const state = flux.state("idle");
  let bars = [];
  let sel = null; // the live selection of a drag or of Shift+arrows
  let held = null; // the narrowed range: bars outside it dim
  let cur = null; // the keyboard cursor
  let anchor = null;
  let dragging = false;
  let alt = false;
  let hostOnly = null; // the host the grid keeps after a row click
  let drag = null; // the pointer drag in progress
  let current = false;
  let pending = false; // an explain-run that arrived before the chapter was current
  let played = false; // the autoplay runs once
  let auto = null; // the running autoplay, with its cancel()
  let seq = () => {}; // the running scripted sequence's cancel()
  let typing = () => {};
  let typed = "";

  const paint = () => {
    bars.forEach((b, i) => {
      b.classList.toggle("sel", !!sel && i >= sel[0] && i <= sel[1]);
      b.classList.toggle("in", !!held && i >= held[0] && i <= held[1]);
      b.classList.toggle("cur", cur === i);
    });
    track.classList.toggle("drag", !!sel);
    track.classList.toggle("alt", !!sel && (alt || latched()));
    track.classList.toggle("explain-narrowed", state.get() === "narrowed");
  };
  const draw = () => {
    bars = flux.bars(track, { counts: S.counts, p95: S.p95, fail: S.fail, spike: S.spike, height: flux.mobile() ? 48 : 56 });
    paint();
  };
  const say = (k, text) => {
    let s = done.querySelector(`[data-key="${k}"]`);
    if (!s) {
      s = document.createElement("span");
      s.dataset.key = k;
      done.append(s);
    }
    s.textContent = text;
  };
  const announce = (lo, hi) => {
    live.textContent = "";
    live.textContent = span(lo, hi);
  };
  const setCount = (n) => {
    countEl.textContent = `${num(n)} messages`;
    totalEl.textContent = `total ${num(n)}`;
  };
  const type = (text) => {
    typing();
    typed = text;
    typing = flux.typewriter(typedin, text, { cps: Math.max(30, Math.round(text.length / 0.3)) });
  };
  const stopTyping = () => {
    typing();
    typing = () => {};
    typedin.textContent = typed;
  };
  const stopSeq = () => {
    seq();
    seq = () => {};
  };
  /** The grid keeps the narrowed host's rows, and three rows while the panel is open. */
  const layout = () => {
    const open = !panel.hidden;
    scene.classList.toggle("explain-open", open);
    let shown = 0;
    for (const r of gridRows) {
      const ok = !hostOnly || r.querySelector("[data-col='host']").textContent === hostOnly;
      const show = ok && (!open || shown < 3);
      if (show) shown++;
      r.hidden = !show;
    }
  };
  const labelAt = (x, text) => {
    dragLabel.hidden = false;
    dragLabel.textContent = text;
    dragLabel.style.left = `${clamp(x, 0, track.clientWidth)}px`;
  };
  const hideLabel = () => {
    dragLabel.hidden = true;
  };
  const closePanel = () => {
    panel.hidden = true;
    spin.hidden = true;
    rowsBox.hidden = true;
    nothing.hidden = true;
    xrows.forEach((r) => r.classList.remove("picked"));
  };
  /** The spinner gives way to the rows, or to the app's "Nothing stands out" line. */
  const finishExplain = () => {
    if (panel.hidden || spin.hidden) return;
    spin.hidden = true;
    if (state.get() === "explained") {
      rowsBox.hidden = false;
      say("explained", "Explained: v2.4.1 on payments-2");
    } else nothing.hidden = false;
  };

  /** S0: the line restored, the bars at rest, the panel hidden. */
  const reset = () => {
    cancelAuto();
    stopSeq();
    typing();
    typing = () => {};
    typed = "";
    typedin.textContent = "";
    sel = held = cur = anchor = null;
    dragging = false;
    alt = false;
    drag = null;
    hostOnly = null;
    closePanel();
    setCount(1244);
    done.textContent = "";
    state.set("idle");
    paint();
    layout();
    hideLabel();
  };

  /** S2 / S2n: the panel's head, a spinner, then the three rows or the app's own line. */
  const explain = (lo, hi, { instant = false } = {}) => {
    stopSeq();
    sel = null;
    dragging = false;
    alt = false;
    latch(false);
    hideLabel();
    const overlap = lo <= SPIKE_HI && hi >= SPIKE_LO;
    spanEl.textContent = `${tm(lo)}:00.000 – ${tm(hi)}:00.000 against the three times as long before it, over 6 fields`;
    closePanel();
    panel.hidden = false;
    spin.hidden = false;
    state.set(overlap ? "explained" : "nothing");
    paint();
    layout();
    if (instant || flux.reduced) finishExplain();
    else seq = flux.play([[600, finishExplain]]);
  };

  /** S2′: a plain drag writes the app's between clause; bars outside the stretch dim to .2. */
  const narrow = (lo, hi) => {
    stopSeq();
    sel = null;
    dragging = false;
    alt = false;
    hideLabel();
    closePanel();
    hostOnly = null;
    held = [lo, hi];
    state.set("narrowed");
    type(` | between ${tm(lo)} and ${tm(hi)}`);
    setCount(S.counts.slice(lo, hi + 1).reduce((a, b) => a + b, 0));
    done.textContent = "";
    const p = document.createElement("span");
    p.className = "explain-plain";
    p.append("That narrowed the range: a plain drag writes a between clause into the query. Hold ⌥, or tap the key, and drag again to explain it. ");
    const r = document.createElement("button");
    r.type = "button";
    r.className = "explain-reset";
    r.textContent = "Reset";
    r.addEventListener("click", reset);
    p.append(r);
    done.append(p);
    paint();
    layout();
  };

  /** S3: a row narrows the console to its value (the counts are the demo story's). */
  const pick = (row) => {
    const { field, value } = row.dataset;
    xrows.forEach((r) => r.classList.toggle("picked", r === row));
    hostOnly = field === "route" ? null : "payments-2";
    type(` AND ${field}:"${value}"`);
    setCount({ version: 534, host: 1031, route: 1244 }[field]);
    say("narrowed", `Console narrowed to ${field}:"${value}"`);
    state.set("row");
    layout();
  };

  /** The button and the palette: the gesture performed as a scripted drag, no cursor. */
  const scripted = ({ instant = false } = {}) => {
    cancelAuto();
    stopSeq();
    if (instant || flux.reduced) return explain(SPIKE_LO, SPIKE_HI, { instant: true });
    sel = [SPIKE_LO, SPIKE_HI];
    alt = true;
    paint();
    seq = flux.play([[350, () => explain(SPIKE_LO, SPIKE_HI)]]);
  };

  // ---- the pointer drag (Timeline.tsx onDown/move/up), with pointer capture and a 6px threshold on touch ----
  const bucketAt = (x) => {
    const r = track.getBoundingClientRect();
    return clamp(Math.floor(((x - r.left) / r.width) * N), 0, N - 1);
  };
  const begin = (e) => {
    drag.started = true;
    dragging = true;
    alt = e.altKey || latched();
    cur = anchor = null;
  };
  const moveTo = (e) => {
    sel = order(drag.from, bucketAt(e.clientX));
    paint();
    labelAt(e.clientX - track.getBoundingClientRect().left, `${alt || latched() ? "explain" : "narrow to"} ${span(sel[0], sel[1])}`);
  };
  const abort = () => {
    drag = null;
    dragging = false;
    sel = null;
    hideLabel();
    paint();
  };
  track.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || drag) return;
    cancelAuto();
    drag = { id: e.pointerId, from: bucketAt(e.clientX), x0: e.clientX, touch: e.pointerType === "touch", started: false };
    track.setPointerCapture(e.pointerId);
    if (!drag.touch) {
      begin(e);
      moveTo(e);
    }
  });
  track.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.started) {
      if (Math.abs(e.clientX - drag.x0) < 6) return;
      begin(e);
    }
    moveTo(e);
  });
  track.addEventListener("pointerup", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.started) return;
    const [lo, hi] = order(d.from, bucketAt(e.clientX));
    if (alt || latched()) explain(lo, hi);
    else narrow(lo, hi);
  });
  track.addEventListener("pointercancel", (e) => {
    if (drag && e.pointerId === drag.id) abort();
  });

  // ---- the keyboard path on the track ----
  const focused = () => document.activeElement === track;
  const step = (dir, extend) => {
    const prev = cur;
    cur = prev == null ? SPIKE_LO : clamp(prev + dir, 0, N - 1);
    if (extend) {
      if (anchor == null) anchor = prev == null ? cur : prev;
      sel = order(anchor, cur);
      announce(sel[0], sel[1]);
    } else {
      anchor = null;
      sel = null;
    }
    paint();
  };
  const commit = (explainIt) => {
    const [lo, hi] = sel || (cur != null ? [cur, cur] : [SPIKE_LO, SPIKE_HI]);
    cur = anchor = null;
    if (explainIt) explain(lo, hi);
    else narrow(lo, hi);
  };
  flux.onKey("arrowleft", () => (step(-1, false), true), { when: focused });
  flux.onKey("arrowright", () => (step(1, false), true), { when: focused });
  flux.onKey("shift+arrowleft", () => (step(-1, true), true), { when: focused });
  flux.onKey("shift+arrowright", () => (step(1, true), true), { when: focused });
  flux.onKey("enter", () => (commit(latched()), true), { when: focused });
  flux.onKey("alt+enter", () => (commit(true), true), { when: focused });
  flux.onKey(
    "escape",
    () => {
      if (state.get() === "idle" && cur == null && !sel) return false;
      reset();
      return true;
    },
    { when: () => current && !isTyping() && !document.querySelector("dialog[open]") },
  );
  track.addEventListener("blur", () => {
    if (dragging || (cur == null && !sel)) return;
    cur = anchor = sel = null;
    paint();
  });

  // ---- the autoplay: a drawn cursor performs the ⌥-drag once, unless the visitor touches anything ----
  const xAt = (b) => `${((b + 0.5) / N) * 100}%`;
  const playAuto = () => {
    played = true;
    let tween = () => {};
    cursor.style.left = xAt(38);
    cursor.classList.add("on");
    const stop = flux.play([
      [500, () => latch(true)],
      [
        300,
        () => {
          tween = flux.tween(38, SPIKE_LO, 400, (v) => (cursor.style.left = xAt(v)));
        },
      ],
      [
        450,
        () => {
          dragging = true;
          alt = true;
          sel = [SPIKE_LO, SPIKE_LO];
          paint();
          const w = track.clientWidth;
          tween = flux.tween(SPIKE_LO, SPIKE_HI, 900, (v) => {
            const to = Math.round(v);
            cursor.style.left = xAt(v);
            sel = [SPIKE_LO, to];
            paint();
            labelAt(((v + 0.5) / N) * w, `explain ${span(SPIKE_LO, to)}`);
          });
        },
      ],
      [950, () => explain(SPIKE_LO, SPIKE_HI)],
      [
        400,
        () => {
          cursor.classList.remove("on");
          auto = null;
        },
      ],
    ]);
    auto = {
      cancel() {
        stop();
        tween();
        cursor.classList.remove("on");
        hideLabel();
        if (dragging) {
          dragging = false;
          sel = null;
          alt = false;
          paint();
        }
        if (state.get() === "idle") latch(false);
        auto = null;
      },
    };
  };
  const cancelAuto = () => {
    if (flux.stage.cancel) flux.stage.cancel();
    if (auto) auto.cancel();
  };
  const arm = () => {
    if (played || flux.reduced) return;
    flux.stage.autoplay(() => {
      if (current && !auto && !drag && !sel && state.get() === "idle") playAuto();
    }, 3500);
  };
  const touch = () => {
    if (current) cancelAuto();
  };
  for (const target of [stageEl, act]) {
    if (!target) continue;
    target.addEventListener("pointerdown", touch);
    target.addEventListener("keydown", touch);
  }
  const pulse = () => {
    ring.classList.remove("on");
    void ring.offsetWidth;
    ring.classList.add("on");
  };

  // ---- the controls ----
  key.addEventListener("click", () => latch(!latched()));
  runBtn.addEventListener("click", () => scripted());
  $(".explain-x").addEventListener("click", reset);
  $(".explain-rerun").addEventListener("click", reset);
  xrows.forEach((r) => r.addEventListener("click", () => pick(r)));
  flux.on("explain-run", () => {
    if (current) scripted();
    else pending = true;
  });
  flux.on("visibility", ({ paused }) => {
    if (paused) {
      if (auto) {
        auto.cancel();
        played = false;
      }
    } else if (current && !played && state.get() === "idle") arm();
  });
  matchMedia("(max-width: 640px)").addEventListener("change", draw);

  flux.chapters.register(el, {
    clock: "10:43",
    label: "Why this stretch?",
    scene: "explain",
    enter({ instant }) {
      current = true;
      if (flux.stage.scene() !== "explain") flux.stage.setScene("explain");
      if (pending) {
        pending = false;
        scripted({ instant });
        return;
      }
      if (state.get() !== "idle") return;
      if (instant) {
        explain(SPIKE_LO, SPIKE_HI, { instant: true });
        return;
      }
      pulse();
      arm();
    },
    leave() {
      current = false;
      cancelAuto();
      stopSeq();
      stopTyping();
      if (drag) abort();
      finishExplain();
      hideLabel();
    },
  });

  draw();
  layout();
})();

// ==== trace ====
// trace — 10:44 · One request, every service: the TraceDialog, the JourneyPanel's lanes and the service map
(() => {
  const el = document.getElementById("trace");
  if (!el || !window.flux || !flux.stage) return;
  const scene = flux.stage.el.querySelector('.scene[data-scene="trace"]');
  if (!scene) return;
  const q = (sel, root = scene) => root.querySelector(sel);
  const NS = "http://www.w3.org/2000/svg";
  const story = document.getElementById("story");
  const DEFAULT_ID = "req_7f3a9c2e";

  // §6: the six lines of req_7f3a9c2e, oldest first; ord-10531 adds the wallet's. x = the dot's place on its lane.
  const LINES = [
    {
      t: "10:42:09.004",
      s: "gateway",
      l: "INFO",
      m: "POST /v1/checkout accepted · req_7f3a9c2e",
      x: 2,
    },
    {
      t: "10:42:09.031",
      s: "orders",
      l: "INFO",
      m: "Order ord-10531 created",
      x: 5,
    },
    {
      t: "10:42:09.044",
      s: "payments",
      l: "INFO",
      m: "Charging ord-10531 via provider",
      x: 8,
    },
    {
      t: "10:42:17.052",
      s: "payments",
      l: "ERROR",
      m: "Charge failed for request req_7f3a9c2e: upstream timeout after 8000ms",
      x: 92,
    },
    {
      t: "10:42:17.060",
      s: "orders",
      l: "WARN",
      m: "Order ord-10531 left pending: payment failed",
      x: 95,
    },
    {
      t: "10:42:17.071",
      s: "gateway",
      l: "INFO",
      m: "POST /v1/checkout 502 in 8,067 ms",
      x: 98,
    },
  ];
  const WALLET = {
    t: "10:42:17.080",
    s: "wallet",
    l: "INFO",
    m: "Hold released for ord-10531",
    x: 99,
  };
  const TRACES = {
    req_7f3a9c2e: { field: "request_id", lines: LINES },
    "ord-10531": { field: "order_id", lines: LINES.concat(WALLET) },
  };
  // lib/correlation.ts identifying()
  const identifying = (value) => {
    const text = String(value ?? "").trim();
    if (text.length < 4 || text.length > 200) return false;
    return !["-", "n/a", "null", "none", "undefined", "0"].includes(text.toLowerCase());
  };

  const openBtn = q(".trace-open", el);
  const mapBtn = q(".trace-map", el);
  const tryBtn = q(".trace-try", el);
  const act = q(".act", el);
  const done = q(".done", el);
  const veil = q(".trace-veil");
  const dialog = q(".trace-dialog");
  const input = q("#trace-id", dialog);
  const range = q("#trace-range", dialog);
  const runBtn = q(".trace-run", dialog);
  const miss = q(".trace-miss", dialog);
  const tab = q(".trace-tab");
  const tabId = q(".trace-tab-id");
  const tabCharges = q(".trace-tab-charges");
  const line = q(".trace-line");
  const lanes = q(".trace-lanes");
  const grid = q(".trace-grid");
  const mapView = q(".trace-mapview");
  const spikes = [...scene.querySelectorAll(".trace-spike")];
  const gfoot = {
    rows: q(".trace-gf-rows"),
    page: q(".trace-gf-page"),
    total: q(".trace-gf-total"),
    ms: q(".trace-gf-ms"),
  };

  let state = "idle"; // idle | told
  let current = null; // the id whose story is on screen
  let mapOn = false;
  let dialogOpen = false;
  let opener = null;
  let cancelAuto = () => {};
  let cancelPlay = () => {};
  let cancelFade = () => {};
  let dots = []; // by line index, time order
  let rows = [];

  const node = (tag, cls, content) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (content != null) n.textContent = content;
    return n;
  };
  const icon = (href) => {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(NS, "use");
    use.setAttribute("href", href);
    svg.append(use);
    return svg;
  };
  const short = (t) => t.slice(0, 8);
  const typing = () => {
    const a = document.activeElement;
    return !!a && a.matches("input, textarea, select, [contenteditable=true]");
  };
  const onScreen = () => {
    if (!story) return false;
    const r = story.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  };
  const isCurrent = () => !!flux.chapters.current && flux.chapters.current.el === el;
  const showScene = () => {
    if (flux.stage.scene() !== "trace") flux.stage.setScene("trace");
  };
  // the stage fades between scenes: what needs the scene on screen (focus, a transition) waits for its "scene" event
  let offShown = () => {};
  const whenShown = (fn) => {
    offShown();
    if (getComputedStyle(scene).display !== "none") return fn();
    const off = flux.on("scene", ({ name } = {}) => {
      if (name !== "trace") return;
      offShown();
      fn();
    });
    offShown = () => {
      off();
      offShown = () => {};
    };
  };
  const lanesOf = (lines) => {
    const out = [];
    const by = new Map();
    for (const l of lines) {
      let lane = by.get(l.s);
      if (!lane) {
        lane = { stream: l.s, points: [], errors: 0 };
        by.set(l.s, lane);
        out.push(lane);
      }
      lane.points.push(l);
      if (l.l === "ERROR") lane.errors++;
    }
    return out;
  };
  const setDone = (key, text) => {
    let span = done.querySelector(`[data-done="${key}"]`);
    if (!span) {
      span = node("span");
      span.dataset.done = key;
      done.append(span);
    }
    span.textContent = text;
  };
  const status = () => {
    const t = TRACES[current];
    if (t) flux.emit("status", `${t.lines.length} lines · ${lanesOf(t.lines).length} streams`);
  };
  const select = (i, focusDot) => {
    rows.forEach((r, k) => r.classList.toggle("sel", k === i));
    dots.forEach((d, k) => d.classList.toggle("sel", k === i));
    if (focusDot && dots[i]) dots[i].focus({ preventScroll: true });
  };

  /** Draws the JourneyPanel and the grid for an id; returns when the cascade ends (ms). */
  const build = (id) => {
    const { field, lines } = TRACES[id];
    const groups = lanesOf(lines);
    const failed = lines.filter((l) => l.l === "ERROR").length;
    lanes.textContent = "";
    grid.textContent = "";
    dots = [];
    rows = [];

    const head = node("div", "lhead");
    const fold = node("button", "trace-fold");
    fold.type = "button";
    fold.setAttribute("aria-label", "Hide the lanes");
    fold.setAttribute("aria-expanded", "true");
    fold.append(icon("#i-chevdown"));
    fold.addEventListener("click", () => {
      const open = fold.getAttribute("aria-expanded") === "true";
      fold.setAttribute("aria-expanded", String(!open));
      fold.setAttribute("aria-label", open ? "Show the lanes" : "Hide the lanes");
      fold.classList.toggle("closed", open);
      for (const lane of lanes.querySelectorAll(".lane")) lane.hidden = open;
    });
    head.append(
      fold,
      node("b", null, id),
      node("span", null, `${groups.length} streams · ${short(lines[0].t)} → ${short(lines[lines.length - 1].t)}`),
    );
    if (failed) {
      const f = node("span", null, `${failed} failed`);
      f.style.color = "var(--red)";
      head.append(f);
    }
    const found = node("span", null, "found in ");
    const chip = node("span", "trace-chip", `${field} `);
    chip.append(node("span", null, String(lines.length)));
    found.append(chip);
    head.append(found, node("span", "right muted", `over the ${lines.length} rows on screen`));
    lanes.append(head);

    const hd = node("div", "hd");
    hd.append(node("span"), node("span", null, "timestamp"), node("span", null, "level"), node("span", null, "message"));
    grid.append(hd);
    lines.forEach((l, i) => {
      const r = node("div", "tr");
      r.style.setProperty("--i", i);
      const time = node("span", null, short(l.t));
      time.title = l.t;
      r.append(node("span", "n", String(i + 1)), time, node("span", `lvl-${l.l.toLowerCase()}`, l.l), node("span", null, l.m));
      r.addEventListener("click", () => select(i));
      rows.push(r);
      grid.append(r);
    });

    const last = groups.length * 120 + 160; // the red dot lands last
    groups.forEach((g, gi) => {
      const lane = node("div", "lane");
      lane.style.setProperty("--i", gi);
      const cnt = node("span", "cnt", g.errors ? `${g.points.length} · ${g.errors}✕` : String(g.points.length));
      if (g.errors) cnt.style.color = "var(--red)";
      const track = node("i");
      for (const p of g.points) {
        const i = lines.indexOf(p);
        const bad = p.l === "ERROR";
        const d = node("button", bad ? "dot bad" : "dot");
        d.type = "button";
        d.style.left = `${p.x}%`;
        d.style.setProperty("--d", `${bad ? last : gi * 120 + 60}ms`);
        d.setAttribute("aria-label", `${g.stream} · ${p.t} · ${bad ? "failed: " : ""}${p.m}`);
        d.addEventListener("click", () => select(i));
        dots[i] = d;
        track.append(d);
      }
      lane.append(node("span", null, g.stream), cnt, track);
      lanes.append(lane);
    });
    return last + 400;
  };

  const showLanes = () => {
    lanes.hidden = false;
    grid.hidden = false;
    lanes.classList.remove("trace-fade");
    grid.classList.remove("trace-fade");
    mapView.hidden = true;
    mapView.classList.remove("drawn");
  };

  /** S2: the id's story, told. */
  const told = (id, instant) => {
    const t = TRACES[id];
    if (!t) return false;
    cancelAuto();
    cancelPlay();
    cancelFade();
    closeDialog(false);
    state = "told";
    current = id;
    mapOn = false;
    showScene();
    scene.classList.toggle("trace-instant", !!instant || flux.reduced);
    const end = build(id);
    const n = lanesOf(t.lines).length;
    tabId.textContent = id;
    tab.hidden = false;
    tab.classList.add("active");
    tabCharges.classList.remove("active");
    line.textContent = "";
    line.append(node("span", "s", id));
    for (const s of spikes) s.hidden = true;
    showLanes();
    mapBtn.setAttribute("aria-pressed", "false");
    mapBtn.textContent = "Show the map";
    gfoot.rows.textContent = `${t.lines.length} rows`;
    gfoot.page.textContent = `1–${t.lines.length}`;
    gfoot.total.textContent = `total ${t.lines.length}`;
    gfoot.ms.hidden = true;
    flux.island?.set("run:trace", { title: id, detail: id, state: "running" });
    cancelPlay = flux.play([
      [
        instant ? 0 : end,
        () => {
          flux.island?.clear("run:trace");
          status();
          setDone("trace", `${t.lines.length} lines across ${n} services — the failure at 10:42:17 in payments`);
        },
      ],
    ]);
    return true;
  };

  /** S3: the service map in place of the lanes and the grid. */
  const setMap = (on, instant) => {
    if (on === mapOn) return;
    if (on && state !== "told") told(DEFAULT_ID, true);
    mapOn = on;
    cancelFade();
    mapBtn.setAttribute("aria-pressed", String(on));
    mapBtn.textContent = on ? "Back to the lanes" : "Show the map";
    if (!on) {
      showLanes();
      return;
    }
    const draw = () => {
      lanes.hidden = true;
      grid.hidden = true;
      lanes.classList.remove("trace-fade");
      grid.classList.remove("trace-fade");
      mapView.classList.remove("drawn");
      mapView.hidden = false;
      whenShown(() => {
        if (!mapOn) return;
        void mapView.offsetWidth; // the edges start undrawn, then the transition runs
        mapView.classList.add("drawn");
      });
      setDone("map", "5 services, joined by request_id");
    };
    if (instant || flux.reduced) draw();
    else {
      lanes.classList.add("trace-fade");
      grid.classList.add("trace-fade");
      cancelFade = flux.play([[160, draw]]);
    }
  };

  // ---- the dialog ----
  const validate = () => (runBtn.disabled = !identifying(input.value));
  const openDialog = (id, from) => {
    showScene();
    if (!dialogOpen) opener = from === undefined ? document.activeElement : from;
    dialogOpen = true;
    if (id) input.value = id;
    miss.textContent = "";
    validate();
    veil.hidden = false;
    dialog.hidden = false;
    whenShown(() => {
      if (!dialogOpen) return;
      input.focus({ preventScroll: true });
      input.select();
    });
  };
  function closeDialog(back) {
    if (!dialogOpen) return;
    dialogOpen = false;
    offShown();
    veil.hidden = true;
    dialog.hidden = true;
    miss.textContent = "";
    if (back) {
      const to = opener && opener.isConnected && opener !== document.body ? opener : q("h2", el);
      if (to) to.focus({ preventScroll: true });
    } else if (dialog.contains(document.activeElement)) document.activeElement.blur();
    opener = null;
  }
  const submit = () => {
    const id = input.value.trim();
    if (!identifying(id)) return;
    if (!TRACES[id]) {
      miss.textContent = `Nothing in any stream mentions “${id}” in the ${range.value.toLowerCase()}.`;
      return;
    }
    told(id, flux.reduced);
    const bad = dots.find((d) => d && d.classList.contains("bad"));
    if (bad) bad.focus({ preventScroll: true });
  };

  input.addEventListener("input", () => {
    validate();
    miss.textContent = "";
  });
  runBtn.addEventListener("click", submit);
  q(".x", dialog).addEventListener("click", () => closeDialog(true));
  veil.addEventListener("click", () => closeDialog(true));
  openBtn.addEventListener("click", () => openDialog(DEFAULT_ID, openBtn));
  if (tryBtn) tryBtn.addEventListener("click", () => openDialog("ord-10531", tryBtn));
  mapBtn.addEventListener("click", () => setMap(!mapOn));
  q(".ctb .run").addEventListener("click", () => (state === "told" ? told(current, flux.reduced) : openDialog(DEFAULT_ID)));

  // ---- keys and the bus ----
  flux.onKey("shift+meta+i", () => {
    if (!onScreen() || dialogOpen) return false;
    if (!isCurrent()) flux.go("trace");
    openDialog(current || DEFAULT_ID);
    return true;
  });
  flux.onKey("shift+meta+m", () => {
    if (!onScreen() || dialogOpen) return false;
    if (!isCurrent()) flux.go("trace");
    setMap(!mapOn);
    return true;
  });
  flux.onKey(
    "escape",
    () => {
      if (dialogOpen) {
        closeDialog(true);
        return true;
      }
      if (mapOn && isCurrent()) {
        setMap(false);
        return true;
      }
      return false;
    },
    {
      when: () => dialogOpen || (!typing() && !document.querySelector("dialog[open]")),
    },
  );
  flux.onKey("enter", () => (submit(), true), {
    when: () => document.activeElement === input,
  });
  const dotFocused = () => dots.includes(document.activeElement);
  const step = (dir) => () => {
    const n = dots.indexOf(document.activeElement) + dir;
    if (dots[n]) select(n, true);
    return true;
  };
  flux.onKey("arrowleft", step(-1), { when: dotFocused });
  flux.onKey("arrowright", step(1), { when: dotFocused });
  flux.on("trace-open", (d) => {
    const id = d && d.id ? String(d.id) : DEFAULT_ID;
    if (d && d.run && TRACES[id]) told(id, flux.reduced);
    else openDialog(id);
  });
  flux.on("map-open", () => setMap(true));
  flux.on("visibility", ({ paused }) => paused && cancelAuto());
  // any hand on the stage or the act row ends the autoplay
  for (const target of [flux.stage.el, act])
    for (const ev of ["pointerdown", "keydown"])
      target.addEventListener(
        ev,
        () => {
          cancelAuto();
          if (state === "idle") cancelPlay();
        },
        true,
      );

  // ---- the chapter ----
  const arm = () => {
    cancelAuto();
    const off = flux.stage.autoplay(() => {
      if (state !== "idle" || dialogOpen) return;
      openDialog(DEFAULT_ID, null);
      cancelPlay = flux.play([[1200, () => dialogOpen && !flux.stage.touched && submit()]]);
    }, 3500);
    cancelAuto = () => {
      if (typeof off === "function") off();
      else if (flux.stage.cancel) flux.stage.cancel();
      cancelAuto = () => {};
    };
  };
  flux.bars(q("[data-bars]"), {
    counts: flux.SERIES.counts,
    p95: flux.SERIES.p95,
    fail: flux.SERIES.fail,
    spike: flux.SERIES.spike,
  });
  flux.chapters.register(el, {
    clock: "10:44",
    label: "One request, every service",
    scene: "trace",
    enter({ instant, first }) {
      showScene();
      if (state === "told") {
        status();
        return;
      }
      if (instant || flux.reduced) told(DEFAULT_ID, true);
      else if (first && !dialogOpen) arm();
    },
    leave() {
      cancelAuto();
      cancelPlay();
      cancelFade();
      offShown();
      closeDialog(false);
      flux.island?.clear("run:trace");
    },
  });
})();

// ==== case ====
// the case: right-click the red line, Investigate, the InvestigationWindow fills a part at a time, Ask Claude to fix
(() => {
  const el = document.getElementById("case");
  if (!el || !window.flux || !flux.stage) return;
  const scene = flux.stage.el.querySelector('.scene[data-scene="case"]');
  const frame = flux.stage.el.querySelector(".frame");
  if (!scene || !frame) return;
  const grid = scene.querySelector(".grid");
  const rows = [...grid.querySelectorAll(".tr")];
  const groups = scene.querySelector(".case-groups");
  const veil = scene.querySelector(".case-veil");
  const win = scene.querySelector(".case-win");
  const cards = [...win.querySelectorAll(".case-card")];
  const hint = win.querySelector(".case-hint");
  const ask = win.querySelector(".case-ask");
  const done = el.querySelector(".done");

  // reportOf(evidence), verbatim (src/lib/investigate.ts)
  const REPORT = [
    "# Charge failed for request req_7f3a9c2e: upstream timeout after 8000ms",
    "",
    "- **Where:** payments (ERROR)",
    "- **When:** 2026-10-14 10:42:17",
    "- **How often:** 148 in the last hour, 148 in the last 24 hours, first seen 10:41:12",
    "- **Who else:** 148 distinct request ids in a sample of 148; most of them share `host=payments-2` (88%), `version=v2.4.1` (92%)",
    "- **Written at:** `src/Payments/ChargeService.php:237` (from the stack trace)",
    "",
    "## The message",
    "",
    "```",
    "Charge failed for request req_7f3a9c2e: upstream timeout after 8000ms",
    "```",
    "",
    "## The request across services (request_id = req_7f3a9c2e)",
    "",
    "- gateway: 2 lines",
    "- orders: 2 lines",
    "- payments: 2 lines, 1 failed",
    "",
    "Failures, in order:",
    "",
    "- 10:42:17.052 **payments** — Charge failed for request req_7f3a9c2e: upstream timeout after 8000ms",
    "",
    "## The code",
    "",
    "`src/Payments/ChargeService.php:237`",
    "",
    "```",
    'throw new UpstreamTimeout("upstream timeout after {$ms}ms");',
    "```",
    "",
    "Last changed in 9f1c2b7d3e by ada on 2026-10-14: retry provider calls, in [#412 retry provider calls](https://github.com/acme/shop/pull/412)",
    "",
    "## Merged in the last 48 hours",
    "",
    "- 2026-10-14 10:38 [#412 retry provider calls](https://github.com/acme/shop/pull/412)",
    "- 2026-10-13 11:05 [#409 wallet holds expire after 15 min](https://github.com/acme/shop/pull/409)",
  ].join("\n");

  let closeMenu = null; // flux.menu's close() while a menu is open
  let cancelPlay = null; // the gathering, while the cards are arriving
  let pick = 0; // the autoplay's "picked" timer
  let press = 0; // a long-press
  let pressAt = null;
  let opened = false;
  let played = false; // the gesture happened once, by hand or by the autoplay
  let handed = false;
  let narrowed = false;
  let returnTo = null;

  const select = (row) => rows.forEach((r) => r.classList.toggle("sel", r === row));
  const shown = () => rows.filter((r) => !r.hidden);
  const status = (text) => {
    if (text) return flux.emit("status", text);
    const on = shown();
    const streams = new Set(on.map((r) => r.dataset.stream)).size;
    flux.emit("status", `${on.length} lines · ${streams} stream${streams === 1 ? "" : "s"}`);
  };
  const narrow = (keep) => {
    rows.forEach((r) => (r.hidden = !keep(r)));
    grid.hidden = false;
    groups.hidden = true;
    narrowed = true;
    status();
  };
  const reset = () => {
    rows.forEach((r) => (r.hidden = false));
    grid.hidden = false;
    groups.hidden = true;
    narrowed = false;
    status();
  };
  const at = (row) => {
    const r = row.getBoundingClientRect();
    return { x: r.left + scrollX + 120, y: r.bottom + scrollY - 2 };
  };

  // the app's row menu (§5.1), Investigate first; the narrowing items work on this grid only
  const items = (row) => [
    { label: "Investigate", icon: "#i-microscope", onClick: () => open() },
    { separator: true },
    {
      label: "Follow this request",
      icon: "#i-route",
      disabled: !row.dataset.id,
      onClick: () => {
        flux.go("trace");
        flux.emit("trace-open", { id: row.dataset.id, run: true });
      },
    },
    { separator: true },
    { label: "Filter by host", icon: "#i-filter", onClick: () => narrow((r) => r.dataset.host === row.dataset.host) },
    { label: "Exclude host", icon: "#i-filter-x", onClick: () => narrow((r) => r.dataset.host !== row.dataset.host) },
    {
      label: "Group by host",
      icon: "#i-rows",
      onClick: () => {
        narrow(() => true);
        grid.hidden = true;
        groups.hidden = false;
      },
    },
    {
      label: "Show 5 minutes around this",
      icon: "#i-clock",
      onClick: () => {
        narrowed = true;
        status(`${shown().length} lines · 10:37 – 10:47`);
      },
    },
  ];
  const openMenu = (row, where) => {
    if (closeMenu) closeMenu();
    select(row);
    row.focus({ preventScroll: true });
    closeMenu = flux.menu(items(row), { at: where, within: frame, onClose: () => (closeMenu = null) });
  };

  // ---- the window ----
  const fill = (card, last) => {
    card.removeAttribute("data-busy");
    card.removeAttribute("aria-busy");
    if (!last) return;
    cancelPlay = null;
    hint.textContent = "Pastes the case into the terminal where Claude Code runs.";
    ask.disabled = false;
    ask.classList.remove("case-ring");
    void ask.offsetWidth;
    ask.classList.add("case-ring");
  };
  const open = ({ instant = false } = {}) => {
    if (closeMenu) closeMenu();
    clearTimeout(pick);
    if (cancelPlay) cancelPlay();
    played = true;
    flux.stage.setScene("case");
    select(rows[3]);
    returnTo = document.activeElement;
    cards.forEach((c) => {
      c.setAttribute("data-busy", "true");
      c.setAttribute("aria-busy", "true");
    });
    hint.textContent = "Still gathering…";
    ask.disabled = true;
    ask.classList.remove("case-ring");
    veil.hidden = false;
    win.hidden = false;
    win.scrollTop = 0;
    opened = true;
    win.focus({ preventScroll: true });
    const steps = cards.map((c, i) => [500, () => fill(c, i === cards.length - 1)]);
    if (instant) steps.forEach(([, fn]) => fn());
    else cancelPlay = flux.play(steps);
  };
  const close = () => {
    if (!opened) return;
    opened = false;
    if (cancelPlay) cancelPlay();
    cancelPlay = null;
    veil.hidden = true;
    win.hidden = true;
    const back = returnTo && returnTo.isConnected && (scene.contains(returnTo) || el.contains(returnTo)) ? returnTo : rows[3];
    returnTo = null;
    back.focus({ preventScroll: true });
  };

  // ---- the rows: click selects, right-click / Shift+F10 / long-press / ⋯ open the menu, ↑↓ move, Enter selects ----
  grid.addEventListener("click", (e) => {
    const row = e.target.closest(".tr");
    if (!row) return;
    select(row);
    if (e.target.closest(".case-dots")) openMenu(row, e.target.closest(".case-dots"));
  });
  grid.addEventListener("contextmenu", (e) => {
    const row = e.target.closest(".tr");
    if (!row) return;
    e.preventDefault();
    clearTimeout(press);
    if (closeMenu) return; // a long-press already opened it
    openMenu(row, { x: e.pageX, y: e.pageY });
  });
  grid.addEventListener("pointerdown", (e) => {
    clearTimeout(press);
    const row = e.target.closest(".tr");
    if (!row || e.pointerType === "mouse" || e.button !== 0) return;
    pressAt = { x: e.pageX, y: e.pageY };
    press = setTimeout(() => openMenu(row, pressAt), 500);
  });
  grid.addEventListener("pointermove", (e) => {
    if (pressAt && Math.hypot(e.pageX - pressAt.x, e.pageY - pressAt.y) > 6) clearTimeout(press);
  });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) grid.addEventListener(t, () => clearTimeout(press));
  grid.addEventListener("keydown", (e) => {
    const row = e.target.closest(".tr");
    if (!row) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const on = shown();
      const next = on[on.indexOf(row) + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) next.focus({ preventScroll: true });
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(row);
    }
  });
  flux.onKey("shift+f10", () => {
    const row = document.activeElement;
    if (!rows.includes(row) || row.hidden) return false;
    openMenu(row, at(row));
    return true;
  });
  flux.onKey("escape", () => {
    if (opened) {
      close();
      return true;
    }
    if (narrowed && flux.stage.scene() === "case") {
      reset();
      return true;
    }
    return false;
  });

  // ---- the window's controls ----
  win.querySelector(".x").addEventListener("click", close);
  veil.addEventListener("click", close);
  win.querySelector(".case-copy").addEventListener("click", (e) => {
    flux.copy(REPORT, e.currentTarget).then((ok) => {
      if (ok) flux.tip("Report copied", "The case as Markdown, ready for Jira, Slack or a pull request.");
    });
  });
  win.querySelector(".case-trace").addEventListener("click", () => flux.go("trace"));
  ask.addEventListener("click", () => {
    if (ask.disabled) return;
    close();
    handed = true;
    done.textContent = "";
    const line = document.createElement("span");
    line.textContent = "The case: 4 parts, handed to Claude Code";
    done.append(line);
    flux.go("claude");
    flux.emit("case-handed");
  });
  // Tab stays inside the window while it is open
  win.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const stops = [...win.querySelectorAll("button:not(:disabled)")];
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === win)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  el.querySelector(".case-open").addEventListener("click", () => open());
  flux.on("case-open", () => open());

  // ---- the autoplay: the menu opens at row 4 with Investigate under the cursor, and is picked 900ms later ----
  const autoplay = () =>
    flux.stage.autoplay(() => {
      if (opened || closeMenu || flux.chapters.current?.el !== el) return;
      played = true;
      openMenu(rows[3], at(rows[3]));
      pick = setTimeout(() => {
        pick = 0;
        if (closeMenu) open();
      }, 900);
    }, 3500);
  const cancelPick = () => {
    clearTimeout(pick);
    pick = 0;
  };
  for (const node of [flux.stage.el, el.querySelector(".act")]) {
    node.addEventListener("pointerdown", cancelPick);
    node.addEventListener("keydown", cancelPick);
  }
  flux.on("visibility", ({ paused }) => {
    if (!paused) return;
    cancelPick();
    clearTimeout(press);
    if (cancelPlay) {
      cancelPlay();
      cards.forEach((c, i) => fill(c, i === cards.length - 1));
    }
  });

  flux.chapters.register(el, {
    clock: "10:46",
    label: "The case",
    scene: "case",
    enter({ instant }) {
      flux.stage.setScene("case");
      if (opened) return;
      reset();
      select(rows[3]);
      if (handed) return;
      if (instant) open({ instant: true });
      else if (!played) autoplay();
    },
    leave() {
      flux.stage.cancel();
      cancelPick();
      clearTimeout(press);
      if (closeMenu) closeMenu();
      close();
    },
  });
})();

// ==== claude ====
// ==== claude: 10:51 · Handed to the terminal — the brief, the agent's run through Flux's MCP tools, the playground ====
(() => {
  const el = document.getElementById("claude");
  if (!el || !window.flux || !flux.stage) return;
  const $ = (id) => document.getElementById(id);
  const term = $("claude-term");
  const inLine = $("claude-in-line");
  const input = $("claude-in");
  const line = $("claude-line");
  const tab = $("claude-tab");
  const range = $("claude-range");
  const grid = $("claude-grid");
  const done = el.querySelector(".done");
  if (!term || !inLine || !input || !line || !grid || !done) return;

  const CONN = "acme";
  const PAYMENTS = ["payments"];
  const BRIEF = [
    "› Investigate and fix this production error. The evidence Flux gathered is below.",
    "1. Find the root cause in the code, using the evidence. Say what it is, and why, before changing anything.",
    "2. Make the smallest fix on a new branch named fix/charge-failed-for-request-req, with a test that fails without it.",
    "3. Run the project's tests.",
    "4. Open a draft pull request with gh that explains the cause and links this evidence. Do not merge it or push to the main branch.",
    "…",
  ];
  const SAMPLE = {
    list_connections: "which connections?",
    list_streams: "which streams?",
    search_logs: "search upstream timeout",
    count_logs: "how many timeouts in the last 30 minutes?",
    list_endpoints: "which endpoints are failing?",
    current_view: "what is open in Flux?",
    open_query: "open level:ERROR on payments",
    save_query: "watch charge errors on payments after the deploy",
  };

  // ---- the terminal prints text nodes, never HTML ----
  const print = (text, cls) => {
    const div = document.createElement("div");
    if (cls) div.className = cls;
    div.textContent = text;
    term.insertBefore(div, inLine);
    term.scrollTop = term.scrollHeight;
    return div;
  };
  const prompted = (prompt, text) => {
    const div = document.createElement("div");
    const p = document.createElement("span");
    p.className = "prompt";
    p.textContent = prompt;
    div.append(p, document.createTextNode(` ${text}`));
    term.insertBefore(div, inLine);
    term.scrollTop = term.scrollHeight;
  };
  const clear = () => {
    for (const n of [...term.children]) if (n !== inLine) n.remove();
    inLine.hidden = true;
  };

  // a call as Claude Code prints it, the arguments in the tool's own shape (src/lib/mcp.ts)
  const argText = (args) =>
    Object.entries(args)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(", ");
  const argDetail = (args) =>
    Object.entries(args)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" · ");

  // the island's mcp rows, keyed by tool as lib/island.ts keys them; each one goes after 8s
  const rows = new Map();
  const dropRow = (key) => {
    clearTimeout(rows.get(key));
    rows.delete(key);
    flux.island?.clear(key);
  };
  const dropRows = () => [...rows.keys()].forEach(dropRow);
  const call = (tool, args, result) => {
    print(`● flux · ${tool}(${argText(args)})`, "t");
    print(`  ⎿ ${result}`);
    const key = `mcp:${tool}`;
    clearTimeout(rows.get(key));
    flux.island?.set(key, { title: tool, detail: argDetail(args), state: "mcp", at: Date.now() });
    rows.set(
      key,
      setTimeout(() => dropRow(key), 8000),
    );
  };

  // the done rows: the first call, then the latest playground call
  const notes = [null, null];
  const note = (i, text) => {
    if (!notes[i]) {
      notes[i] = document.createElement("span");
      done.append(notes[i]);
    }
    notes[i].textContent = text;
  };

  // ---- S0: the arrival run, 450ms a step; it stops at "Reading …" ----
  let run = null;
  let finished = false;
  const steps = [
    [0, () => prompted("~/shop %", "claude")],
    [450, () => BRIEF.forEach((l) => print(l, "claude-brief"))],
    [450, () => print("● Read src/Payments/ChargeService.php:237", "t")],
    [
      450,
      () => {
        call("search_logs", { connection: CONN, streams: PAYMENTS, query: "upstream timeout", minutes: 60 }, "148 lines");
        note(0, "search_logs answered 148 lines");
      },
    ],
    [450, () => call("count_logs", { connection: CONN, streams: PAYMENTS, query: "upstream timeout AND host:payments-1", minutes: 60 }, "0")],
    [
      450,
      () => {
        const caret = document.createElement("span");
        caret.className = "caret";
        print("● Reading src/Payments/ChargeService.php…", "t").append(caret);
        inLine.hidden = false;
        term.scrollTop = term.scrollHeight;
        finished = true;
        run = null;
      },
    ],
  ];
  const start = (instant) => {
    if (run) return;
    clear();
    finished = false;
    if (instant || flux.reduced) {
      steps.forEach(([, fn]) => fn());
      return;
    }
    run = flux.play(steps);
  };
  const stop = () => {
    if (run) run();
    run = null;
  };
  const mine = () => !!(flux.chapters.current && flux.chapters.current.el === el);

  flux.chapters.register(el, {
    clock: "10:51",
    label: "Handed to the terminal",
    scene: "claude",
    enter({ instant }) {
      flux.stage.setScene("claude");
      flux.emit("status", "1,244 rows · 214 ms");
      if (!finished) start(instant);
    },
    leave() {
      stop();
      dropRows();
    },
  });
  // the case handed over: the terminal starts at once, while the page is still on its way here
  flux.on("case-handed", () => {
    const cur = flux.chapters.current;
    if (!cur || (cur.id !== "case" && cur.id !== "claude")) return;
    flux.stage.setScene("claude");
    if (!run) {
      finished = false;
      start(flux.reduced);
    }
  });
  flux.on("visibility", (d) => {
    if (d && d.paused) stop();
    else if (mine() && !finished && !run) start(flux.reduced);
  });

  // ---- S1: the playground — one canned call per question, never an answer ----
  const view = () => {
    const sel = grid.querySelector(".tr.sel");
    return [
      CONN,
      "payments",
      "POST /v1/charges",
      line.textContent.trim(),
      range ? range.textContent.trim() : "Last 1 hour",
      sel ? `row ${sel.dataset.row} selected` : "no row selected",
    ].join(" · ");
  };
  const route = (text) => {
    const q = text.toLowerCase();
    if (/\bwatch\b|\bsave\b|\bdeploy/.test(q)) {
      return [
        "save_query",
        { connection: CONN, streams: PAYMENTS, query: "level:ERROR AND route:/v1/charges", name: "Charge errors after #418" },
        "saved · watched for new matches",
      ];
    }
    if (/\bcount\b|how many/.test(q)) return ["count_logs", { connection: CONN, streams: PAYMENTS, query: "upstream timeout", minutes: 30 }, "41"];
    if (/\bstreams?\b/.test(q)) return ["list_streams", { connection: CONN }, "gateway · orders · payments · wallet"];
    if (/\bendpoints?\b|\broutes?\b/.test(q)) {
      return [
        "list_endpoints",
        { connection: CONN, stream: "payments" },
        "POST /v1/charges 1,244 · 13.5% · GET /v1/charges/{id} 820 · 0.1% · POST /v1/refunds 96 · 0.0%",
      ];
    }
    if (/\bconnections?\b/.test(q)) return ["list_connections", {}, "acme · graylog · graylog.acme.io"];
    if (/\bview\b|looking|screen|what is open|what's open/.test(q)) return ["current_view", {}, view()];
    if (/\bopen\b/.test(q)) return ["open_query", { connection: CONN, stream: "payments", query: "level:ERROR", minutes: 60 }, "opened in Flux"];
    const m = text.match(/"([^"]+)"|“([^”]+)”/);
    return ["search_logs", { connection: CONN, query: m ? m[1] || m[2] : "upstream timeout", minutes: 30 }, "41 lines"];
  };
  const span = (cls, text) => {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = text;
    return s;
  };
  // open_query: the console line above really changes, the tab flashes once, the page hears about it
  const openQuery = () => {
    line.replaceChildren(span("k", "level"), document.createTextNode(":"), span("s", "ERROR"));
    if (tab) {
      tab.classList.remove("claude-flash");
      void tab.offsetWidth;
      tab.classList.add("claude-flash");
    }
    flux.emit("open-query", { stream: "payments", query: "level:ERROR" });
  };
  if (tab) tab.addEventListener("animationend", () => tab.classList.remove("claude-flash"));

  let last = "";
  const submit = (text) => {
    const q = text.trim();
    if (!q) return;
    if (!finished) {
      stop();
      start(true);
    }
    last = q;
    prompted("demo ›", q);
    const [tool, args, result] = route(q);
    call(tool, args, result);
    if (tool === "open_query") openQuery();
    note(1, `${tool} → ${result}`);
    input.value = "";
    term.scrollTop = term.scrollHeight;
  };
  const typing = () => document.activeElement === input;
  flux.onKey("enter", () => (submit(input.value), true), { when: typing });
  flux.onKey(
    "arrowup",
    () => {
      if (!last) return false;
      input.value = last;
      input.setSelectionRange(last.length, last.length);
      return true;
    },
    { when: typing },
  );
  flux.onKey(
    "escape",
    () => {
      input.value = "";
      return true;
    },
    { when: typing },
  );
  for (const chip of el.querySelectorAll(".claude-chip")) {
    chip.addEventListener("click", () => {
      flux.stage.setScene("claude");
      input.value = SAMPLE[chip.dataset.tool] || "";
      submit(input.value);
    });
  }

  // the two grid rows: a click or Enter moves the selection current_view reads
  const select = (row) => {
    if (!row || !grid.contains(row)) return false;
    for (const r of grid.querySelectorAll(".tr")) r.classList.toggle("sel", r === row);
    return true;
  };
  grid.addEventListener("click", (e) => select(e.target.closest(".tr")));
  flux.onKey("enter", () => select(document.activeElement && document.activeElement.closest(".tr")));

  // ---- the chapter: Show me, the check, Copy ----
  const show = $("claude-show");
  const strip = $("claude-strip");
  const stripMcp = $("claude-strip-mcp");
  const check = $("claude-check");
  if (show && strip && stripMcp) {
    show.addEventListener("click", () => {
      strip.hidden = false;
      stripMcp.classList.remove("pulse");
      void stripMcp.offsetWidth;
      stripMcp.classList.add("pulse");
      flux.emit("mcp-show");
    });
    stripMcp.addEventListener("animationend", () => stripMcp.classList.remove("pulse"));
  }
  flux.on("mcp", (d) => {
    const on = !!(d && d.on);
    if (check) check.hidden = !on;
    if (stripMcp) stripMcp.classList.toggle("on", on);
  });
  const copy = $("claude-copy");
  const code = $("claude-code");
  if (copy && code) copy.addEventListener("click", () => flux.copy(code.textContent.trim(), copy, code));

  // the scene's timeline: the demo hour, the #412 marker left alone
  const S = flux.SERIES;
  flux.bars($("claude-bars"), { counts: S.counts, p95: S.p95, fail: S.fail, spike: S.spike });
})();

// ==== watch ====
(() => {
  const el = document.getElementById("watch");
  if (!el || !window.flux || !flux.stage) return;
  const scene = flux.stage.el.querySelector('.scene[data-scene="watch"]');
  if (!scene) return;
  const $ = (sel, root = el) => root.querySelector(sel);
  const frame = () => flux.stage.el.querySelector(".frame") || flux.stage.el;

  // the chapter's controls
  const act = $(".act");
  const setBtn = $(".watch-set");
  const whenSel = $(".watch-when");
  const everySel = $(".watch-every");
  const mergeBtn = $(".watch-merge");
  const monBtn = $(".watch-monitor");
  const doneEl = $(".done");
  // the scene's parts
  const queries = $(".watch-queries", scene);
  const items = [...scene.querySelectorAll(".watch-item")];
  const payment = items[0];
  const line = $(".watch-line", scene);
  const track = $(".watch-timeline", scene);
  const m418 = $(".watch-m418", scene);
  const queryView = $(".watch-query", scene);
  const monView = $(".watch-mon", scene);
  if (!payment || !line || !track || !m418 || !queryView || !monView || !queries) return;

  // the demo story (§6): the watch, its rounds and the merge
  const NAME = "Payment errors";
  const KEY = "watch:payment-errors";
  const STREAM = "payments";
  const BELOW = [0, 1, 10, 100]; // Alert when → quietBelow
  const EVERY = [15, 60, 300, 900]; // Check every → seconds
  const short = (s) => (s % 60 === 0 ? `${s / 60}m` : `${s}s`); // SavedQueries.tsx short()
  const span = (s) => (s < 60 ? `${s} seconds` : s === 60 ? "minute" : `${Math.round(s / 60)} minutes`); // store.ts shortSpan()
  const below = () => BELOW[whenSel.selectedIndex] || 0;
  const every = () => EVERY[everySel.selectedIndex] || 60;
  const keyOf = (item) => `watch:${item.dataset.name.toLowerCase().replace(/\s+/g, "-")}`;

  let watched = false;
  let rounds = 0;
  let merged = false;
  let radarMin = 0;
  let inMonitor = false;
  let active = false;
  let lastAt = 0;
  let roundT = 0;
  let pickT = 0;
  let slideT = 0;
  let cancelRadar = null;
  let cancelTween = null;
  let closeMenu = null;
  let closeTip = null;

  const S = flux.SERIES;
  flux.bars(track, { counts: S.counts, p95: S.p95, fail: S.fail, spike: S.spike });

  const said = new Set();
  const say = (key, text) => {
    if (said.has(key)) return;
    said.add(key);
    const s = document.createElement("span");
    s.textContent = text;
    doneEl.append(s);
  };

  // ---- the island rows and the badges follow the state
  const render = () => {
    for (const item of items) {
      const on = item.classList.contains("on");
      const badge = item.querySelector(".watch-badge");
      badge.hidden = !on;
      badge.querySelector(".watch-badge-text").textContent = item === payment && below() ? `${short(every())} · <${below()}` : short(every());
      badge.title = `Looking every ${short(every())}, reported as warning`;
      if (item === payment) continue;
      if (on) flux.island?.set(keyOf(item), { title: item.dataset.name, detail: `every ${short(every())}`, state: "watching" });
      else flux.island?.clear(keyOf(item));
    }
    setBtn.disabled = watched;
    mergeBtn.disabled = !watched || merged;
    mergeBtn.textContent = merged ? "Merged" : "Merge #418";
    if (!watched) {
      flux.island?.clear(KEY);
      return;
    }
    const row = { title: NAME, detail: `every ${short(every())}`, state: "watching" };
    if (below()) {
      row.state = "quiet";
      row.detail = `0 on the last round, fewer than ${below()}`;
      row.at = lastAt;
    } else if (rounds && !merged) {
      row.state = "alert";
      row.detail = "3 new on the last round";
      row.at = lastAt;
    } else if (rounds) row.detail = "nothing new on the last round";
    flux.island?.set(KEY, row);
  };

  // ---- the balloon (the app's notification, through flux.tip)
  const fold = () => {
    if (closeTip) closeTip();
    closeTip = null;
  };
  const balloon = (body) => {
    fold();
    closeTip = flux.tip(NAME, body, { icon: "#i-alert", ms: 0, action: { label: "Open", run: () => open(payment) } });
  };
  const news = () => {
    balloon(`3 new matches on ${STREAM}`);
    say("round", "3 new on the last round — the island says so");
  };
  const silence = () => {
    balloon(`Only 0 on ${STREAM} in the last ${span(every())}, fewer than ${below()}`);
    say("silence", "That is how a cron or a webhook that went quiet makes itself heard.");
  };

  // ---- the console line, as the app's editor colours it
  const setLine = (q) => {
    line.textContent = "";
    for (const part of q.split(/(\s+(?:AND|OR)\s+)/)) {
      if (/^\s+(AND|OR)\s+$/.test(part)) {
        const d = document.createElement("span");
        d.className = "dim";
        d.textContent = part.trim();
        line.append(" ", d, " ");
        continue;
      }
      const i = part.indexOf(":");
      if (i < 0) {
        line.append(part);
        continue;
      }
      const k = document.createElement("span");
      k.className = "k";
      k.textContent = part.slice(0, i);
      const s = document.createElement("span");
      s.className = "s";
      s.textContent = part.slice(i + 1);
      line.append(k, ":", s);
    }
  };
  const open = (item) => {
    fold();
    for (const i of items) i.querySelector(".watch-qbtn").classList.toggle("sel", i === item);
    setLine(item.dataset.query);
  };

  // ---- the watch
  const armRound = () => {
    clearTimeout(roundT);
    roundT = setTimeout(round, 3000);
  };
  const armAutoMerge = () => {
    flux.stage.autoplay(() => {
      if (active && watched && !merged) merge();
    }, 4000);
  };
  const watch = (item) => {
    item.classList.add("on");
    if (item === payment) {
      watched = true;
      rounds = 0;
      say("watch", "Watching Payment errors every minute");
      if (below()) {
        lastAt = Date.now();
        silence();
      }
      armRound();
      if (flux.mobile()) queries.classList.add("away");
    }
    render();
  };
  const unwatch = (item) => {
    item.classList.remove("on");
    if (item === payment) {
      watched = false;
      rounds = 0;
      clearTimeout(roundT);
      roundT = 0;
      fold();
      queries.classList.remove("away");
    }
    render();
  };
  const round = () => {
    roundT = 0;
    rounds = 1;
    lastAt = Date.now();
    if (!below() && !merged) news();
    render();
    if (!merged) armAutoMerge();
  };

  // ---- the merge and the radar (lib/radar.ts radarLine)
  const tick = (m) => {
    radarMin = m;
    const row = { title: "shop · #418 retry only on connect errors", detail: `errors 28% → 0.4% · ${m}m since merge`, state: "deploy" };
    if (m === 1) row.at = Date.now();
    flux.island?.set("deploy:418", row);
  };
  const merge = () => {
    if (merged || !watched) return;
    merged = true;
    fold();
    m418.classList.add("in");
    tick(1);
    if (cancelRadar) cancelRadar();
    cancelRadar = flux.play([
      [1500, () => tick(2)],
      [1500, () => tick(3)],
    ]);
    say("merge", "#418 merged at 10:55 — errors 28% → 0.4%");
    render();
  };
  const finishRadar = () => {
    if (cancelRadar) cancelRadar();
    cancelRadar = null;
    if (merged && radarMin < 3) tick(3);
  };

  // ---- the Monitor view (beta)
  const fmt = (n, v) => (n.dataset.dec ? v.toFixed(+n.dataset.dec) : Math.round(v).toLocaleString("en-US")) + (n.dataset.unit || "");
  const nums = () => [...monView.querySelectorAll(".watch-num")];
  const finishTween = () => {
    if (cancelTween) cancelTween();
    cancelTween = null;
    for (const n of nums()) n.textContent = fmt(n, +n.dataset.to);
  };
  const stripe = (on) => {
    const sb = (id) => {
      const u = flux.stage.el.querySelector(`.stripe use[href="#${id}"]`);
      return u && u.closest(".sb");
    };
    const activity = sb("i-activity");
    const server = sb("i-server");
    if (activity) activity.classList.toggle("active", on);
    if (server) server.classList.toggle("active", !on);
  };
  const monitor = (on) => {
    inMonitor = on;
    queryView.hidden = on;
    monView.hidden = !on;
    monBtn.textContent = on ? "Back to the query" : "Open Monitor (beta)";
    stripe(on);
    finishTween();
    if (!on) return;
    const cancels = nums().map((n) =>
      flux.tween(0, +n.dataset.to, 600, (v) => {
        n.textContent = fmt(n, v);
      }),
    );
    cancelTween = () => cancels.forEach((c) => c());
  };

  // ---- the saved-query menu (SavedQueries.tsx items; the watch's knobs are the chapter's setting row)
  const menuFor = (item, at) => {
    if (closeMenu) closeMenu();
    const q = item.dataset.query;
    const on = item.classList.contains("on");
    closeMenu = flux.menu(
      [
        { label: "Open", icon: "#i-square-terminal", onClick: () => open(item) },
        { label: "Copy query", icon: "#i-clipboard", onClick: () => flux.copy(q).then((ok) => ok && flux.tip("Copied", q)) },
        { label: "Rename…", icon: "#i-pencil", disabled: true },
        on
          ? { label: "Stop watching", icon: "#i-bell-off", onClick: () => unwatch(item) }
          : { label: "Watch for new matches", icon: "#i-bell", onClick: () => watch(item) },
        { separator: true },
        { label: "Delete", icon: "#i-trash", danger: true, disabled: true },
      ],
      { at, within: frame(), onClose: () => (closeMenu = null) },
    );
  };
  const itemOf = (t) => (t && t.closest && scene.contains(t) ? t.closest(".watch-item") : null);
  scene.addEventListener("contextmenu", (e) => {
    const item = itemOf(e.target);
    if (!item) return;
    e.preventDefault();
    menuFor(item, { x: e.pageX, y: e.pageY });
  });
  scene.addEventListener("click", (e) => {
    const item = itemOf(e.target);
    if (!item) return;
    if (e.target.closest(".watch-more")) menuFor(item, e.target.closest(".watch-more"));
    else if (e.target.closest(".watch-qbtn")) open(item);
  });
  scene.addEventListener("keydown", (e) => {
    const item = e.key === "ContextMenu" ? itemOf(e.target) : null;
    if (!item) return;
    e.preventDefault();
    menuFor(item, item.querySelector(".watch-qbtn"));
  });
  flux.onKey("shift+f10", () => {
    const item = itemOf(document.activeElement);
    if (!item) return false;
    menuFor(item, item.querySelector(".watch-qbtn"));
    return true;
  });

  // ---- the chapter's controls
  setBtn.addEventListener("click", () => watch(payment));
  mergeBtn.addEventListener("click", merge);
  monBtn.addEventListener("click", () => monitor(!inMonitor));
  whenSel.addEventListener("change", () => {
    if (watched) {
      lastAt = Date.now();
      if (below()) silence();
      else if (rounds && !merged) news();
      else fold();
    }
    render();
  });
  everySel.addEventListener("change", render);
  // a hand on the chapter's controls ends the autoplay, as one on the stage does
  for (const ev of ["pointerdown", "keydown"]) {
    act.addEventListener(ev, () => {
      flux.stage.touched = true;
      flux.stage.cancel();
    });
  }

  // ---- autoplay: the menu opens on Payment errors, the cursor rests on Watch for new matches, and picks it
  const autoWatch = () => {
    if (!active || watched || closeMenu) return;
    menuFor(payment, payment.querySelector(".watch-qbtn"));
    const mi = [...frame().querySelectorAll(".menu .mi")].find((b) => b.textContent.trim() === "Watch for new matches");
    if (!mi) return;
    mi.focus({ preventScroll: true });
    pickT = setTimeout(() => {
      pickT = 0;
      if (closeMenu && mi.isConnected && !flux.stage.touched) mi.click();
    }, 900);
  };
  const arm = () => {
    if (flux.reduced) return;
    if (!watched) flux.stage.autoplay(autoWatch, 3500);
    else if (!rounds) armRound();
    else if (!merged) armAutoMerge();
  };
  const pause = () => {
    clearTimeout(roundT);
    roundT = 0;
    clearTimeout(pickT);
    pickT = 0;
    clearTimeout(slideT);
    slideT = 0;
    finishRadar();
    finishTween();
    flux.stage.cancel();
  };

  const enter = ({ instant, first }) => {
    active = true;
    if (flux.stage.scene() !== "watch") flux.stage.setScene("watch");
    if (instant) queries.classList.add("in");
    else slideT = setTimeout(() => queries.classList.add("in"), 180);
    if (inMonitor) stripe(true);
    if (instant) {
      // the end state at once: the watch set and its first round in
      if (first && !watched) {
        watch(payment);
        clearTimeout(roundT);
        roundT = 0;
        round();
      }
      return;
    }
    arm();
  };
  const leave = () => {
    active = false;
    pause();
    if (closeMenu) closeMenu();
    fold();
    queries.classList.remove("in");
    if (inMonitor) stripe(false);
  };
  flux.on("visibility", ({ paused }) => {
    if (!active) return;
    if (paused) pause();
    else arm();
  });
  flux.chapters.register(el, { clock: "10:58", label: "Keep an eye on it", scene: "watch", enter, leave });
  render();
})();

// ==== motto ====
// the interstitial plays once, when it is first seen: Flux first, then the sources beside it, then the sentence
(() => {
  const el = document.getElementById("motto");
  if (!el || !window.flux || flux.reduced) return;
  el.classList.add("pending");
  flux.reveal(el, () => requestAnimationFrame(() => el.classList.remove("pending")));
})();

// ==== ran ====
// ran — Settings › Connections, the ledger of what crosses which line, the docs' table
(() => {
  const el = document.getElementById("ran");
  if (!el || !window.flux) return;
  const NS = "http://www.w3.org/2000/svg";
  const all = (sel) => [...el.querySelectorAll(sel)];
  /** ← → ↑ ↓ Home End over n items from i; -1 for any other key. */
  const step = (key, i, n) => {
    if (key === "ArrowRight" || key === "ArrowDown") return (i + 1) % n;
    if (key === "ArrowLeft" || key === "ArrowUp") return (i - 1 + n) % n;
    if (key === "Home") return 0;
    if (key === "End") return n - 1;
    return -1;
  };

  // ---- the window: Graylog | Kibana | Local, and Test Connection ----
  // the app's `${kind.label} ${v} · ${n} ${kind.streams}`
  const RESULT = { graylog: "Graylog 6.1 · 4 streams", kibana: "Elasticsearch (Kibana) 8.15 · 4 data views", local: "Local files & Docker · 3 logs" };
  const tabs = all("[role=tab]");
  const test = el.querySelector(".ran-test");
  const result = el.querySelector(".ran-result");
  let kind = "graylog";
  let testT = 0;
  const idle = () => {
    clearTimeout(testT);
    testT = 0;
    test.textContent = "Test Connection";
    result.textContent = "";
  };
  const tested = () => {
    idle();
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(NS, "use");
    use.setAttribute("href", "#i-check");
    svg.append(use);
    result.append(svg, document.createTextNode(RESULT[kind]));
  };
  test.addEventListener("click", () => {
    if (testT) return;
    if (flux.reduced) return tested();
    result.textContent = "";
    test.textContent = "Testing…";
    const spin = document.createElement("i");
    spin.className = "spin";
    result.append(spin);
    testT = setTimeout(tested, 700);
  });
  const pick = (i, focus) => {
    tabs.forEach((t, j) => {
      const on = j === i;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    kind = tabs[i].dataset.kind;
    idle();
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => pick(i));
    t.addEventListener("keydown", (e) => {
      const n = step(e.key, i, tabs.length);
      if (n < 0) return;
      e.preventDefault();
      pick(n, true);
    });
  });

  // ---- the ledger: Crossed / Stayed / Reached us ----
  const ACTIONS = {
    search: ["your query, to graylog.acme.io, with the token it needs", "the lines you read, rendered on your Mac", "nothing"],
    watch: ["the saved query, to your source, every minute while Flux is open", "the matches, the island, the notification", "nothing"],
    trace: ["one text search, to every stream of the connection", "the lanes and the lines", "nothing"],
    claude: [
      "the agent's calls, over 127.0.0.1:4319, behind the token Flux made; lines and counts come back, never a token",
      "the connection and its token",
      "nothing — what the agent sends its own model is between you and the agent",
    ],
    signin: [
      "your email address, and the name and picture GitHub or Google give, to your account",
      "everything marked never in the table below",
      "your appearance, keymap, console and grid settings",
    ],
    update: [
      "a request for the current version, at launch and every hour, to our update server",
      "logs, tokens, queries — none of them are part of it",
      "the request itself; nothing else",
    ],
  };
  const group = el.querySelector(".ran-actions");
  const radios = all("[role=radio]");
  const lines = el.querySelector(".ran-lines");
  const dds = all(".ran-lines dd");
  let pinned = "search";
  let shown = "search";
  let fadeT = 0;
  const fill = (key) => ACTIONS[key].forEach((text, i) => (dds[i].textContent = text));
  const settle = () => {
    clearTimeout(fadeT);
    fadeT = 0;
    fill(shown);
    lines.classList.remove("ran-fading");
  };
  const show = (key) => {
    if (key === shown || !ACTIONS[key]) return;
    shown = key;
    clearTimeout(fadeT);
    if (flux.reduced) return settle();
    lines.classList.add("ran-fading");
    fadeT = setTimeout(settle, 160);
  };
  const check = (i, focus) => {
    radios.forEach((r, j) => {
      r.setAttribute("aria-checked", String(j === i));
      r.tabIndex = j === i ? 0 : -1;
    });
    pinned = radios[i].dataset.action;
    show(pinned);
    if (focus) radios[i].focus();
  };
  radios.forEach((r, i) => {
    r.addEventListener("click", () => check(i));
    r.addEventListener("keydown", (e) => {
      const n = step(e.key, i, radios.length);
      if (n < 0) return;
      e.preventDefault();
      check(n, true);
    });
    // hover previews on a mouse; a click pins
    r.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") show(r.dataset.action);
    });
  });
  group.addEventListener("pointerleave", () => show(pinned));

  // ---- the chapter: no scene; timers end when it is left or the tab is hidden ----
  const rest = () => {
    if (testT) tested();
    if (fadeT) settle();
  };
  flux.chapters.register(el, { clock: "11:02", label: "Where this ran", leave: rest });
  flux.on("visibility", ({ paused }) => paused && rest());
})();

// ==== download ====
// ==== download (§5.8): the figure counts up once the version is known and the section is on screen ====
(() => {
  const el = document.getElementById("download");
  if (!el || !window.flux) return;
  const version = document.getElementById("download-version");
  const published = document.getElementById("download-published");
  const label = document.getElementById("download-dl-text");
  const copy = document.getElementById("download-copy");
  const command = document.getElementById("download-xattr");
  const COMMAND = "xattr -dr com.apple.quarantine /Applications/Flux.app";
  const latest = flux.latest && typeof flux.latest.then === "function" ? flux.latest : Promise.resolve(null);

  let cancel = null;
  let final = "";
  // a count-up interrupted by leaving the chapter ends where it was going
  const settle = () => {
    if (!cancel) return;
    cancel();
    cancel = null;
    if (version) version.textContent = final;
  };
  flux.chapters.register(el, { clock: "11:02", label: "All clear", leave: settle });

  if (copy) copy.addEventListener("click", () => flux.copy(COMMAND, copy, command));

  latest.then((v) => {
    if (v && v.version && label) label.textContent = `Download Flux ${v.version} for macOS`;
  });

  // 0.0.0 → major.minor.patch over 600ms, three integers; a version that is not three numbers is shown whole
  const show = (v) => {
    const parts = (String(v.version).match(/\d+/g) || []).slice(0, 3).map(Number);
    final = parts.length === 3 ? parts.join(".") : String(v.version);
    const when = v.published ? flux.relative(v.published) : "";
    if (published) published.textContent = when ? `published ${when}` : "";
    if (!version) return;
    if (parts.length !== 3) {
      version.textContent = final;
      return;
    }
    cancel = flux.tween(
      0,
      1,
      600,
      (p) => (version.textContent = parts.map((n) => Math.round(n * p)).join(".")),
      () => (cancel = null),
    );
  };
  const revealed = new Promise((resolve) => flux.reveal(el, resolve));
  Promise.all([latest, revealed]).then(([v]) => {
    if (v && v.version) show(v);
  });
})();

// ==== the footer: the hour, the status bar, the MCP switch, the legend (§4) ====
(() => {
  const foot = document.getElementById("foot");
  if (!foot || !window.flux) return;
  const F = window.flux;
  const $ = (id) => document.getElementById(id);

  // ---- tier 1: the hour, from flux.SERIES, drawn by flux.bars
  const track = $("foot-track");
  const barsEl = $("foot-bars");
  const curEl = $("foot-cur");
  const S = F.SERIES;
  if (track && barsEl && S && S.counts && typeof F.bars === "function") {
    const label = (b) =>
      `10:${String(b).padStart(2, "0")} · ${S.counts[b]} requests · p95 ${S.p95[b].toLocaleString("en-US")} ms · ${S.fail[b].toFixed(1)}% failed`;
    const drawn = F.bars(barsEl, { counts: S.counts, p95: S.p95, fail: S.fail, spike: S.spike, height: 110, label });
    const bars = Array.isArray(drawn) && drawn.length ? drawn : [...barsEl.querySelectorAll("i")];
    bars.forEach((b, i) => {
      b.dataset.label = label(i);
      b.style.setProperty("--i", String(i));
    });
    // the red line draws in over 900ms: its on-screen length, since the stroke does not scale with the viewBox
    const fail = barsEl.querySelector(".tl-lines .fail");
    const screenLength = (poly) => {
      const svg = poly.ownerSVGElement;
      const r = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const sx = r.width / (vb.width || 60);
      const sy = r.height / (vb.height || 56);
      let len = 0;
      const p = poly.points;
      for (let i = 1; i < p.numberOfItems; i++) {
        const a = p.getItem(i - 1);
        const b = p.getItem(i);
        len += Math.hypot((b.x - a.x) * sx, (b.y - a.y) * sy);
      }
      return len * 1.02;
    };
    const show = () => {
      track.classList.add("in");
      if (!fail || F.reduced) return;
      const len = screenLength(fail);
      fail.style.transition = "none";
      fail.style.strokeDasharray = String(len);
      fail.style.strokeDashoffset = String(len);
      void fail.getBoundingClientRect();
      fail.style.transition = "stroke-dashoffset 900ms var(--ease)";
      fail.style.strokeDashoffset = "0";
      setTimeout(() => {
        fail.style.transition = "";
        fail.style.strokeDasharray = "";
        fail.style.strokeDashoffset = "";
      }, 1000);
    };
    if (fail && !F.reduced) {
      const len = screenLength(fail);
      fail.style.strokeDasharray = String(len);
      fail.style.strokeDashoffset = String(len);
    }
    if (typeof F.reveal === "function") F.reveal(track, show);
    else show();
    // the keyboard: ← → move the cursor (from 10:41), Home/End jump, Escape clears; the label is announced
    let at = -1;
    const mark = (i) => {
      at = i;
      bars.forEach((b, n) => b.classList.toggle("cur", n === i));
      curEl.textContent = i < 0 ? "" : label(i);
    };
    track.addEventListener("keydown", (e) => {
      if (e.target !== track) return;
      let n;
      if (e.key === "ArrowLeft") n = at < 0 ? 41 : Math.max(0, at - 1);
      else if (e.key === "ArrowRight") n = at < 0 ? 41 : Math.min(bars.length - 1, at + 1);
      else if (e.key === "Home") n = 0;
      else if (e.key === "End") n = bars.length - 1;
      else if (e.key === "Escape") n = -1;
      else return;
      e.preventDefault();
      mark(n);
    });
    track.addEventListener("focus", () => at < 0 && mark(41));
    track.addEventListener("blur", () => mark(-1));
  }
  // the ticks scroll to their chapter; the one last reached is brighter
  const ticks = [...foot.querySelectorAll(".foot-ticks a")];
  ticks.forEach((a) =>
    a.addEventListener("click", (e) => {
      if (typeof F.go !== "function") return;
      e.preventDefault();
      F.go(a.getAttribute("href").slice(1));
    }),
  );
  F.on?.("chapter", (d) => {
    if (d && d.id) ticks.forEach((a) => a.classList.toggle("cur", a.getAttribute("href") === `#${d.id}`));
  });

  // ---- tier 2: the version, once it is known; the MCP switch
  const ver = $("foot-version");
  if (ver && F.latest && typeof F.latest.then === "function") {
    F.latest.then((v) => {
      if (!v || !v.version) return;
      const a = document.createElement("a");
      a.href = "https://github.com/bozkurtemre/flux/releases";
      const rel = v.published && typeof F.relative === "function" ? F.relative(v.published) : "";
      a.textContent = rel ? `Flux ${v.version} · published ${rel}` : `Flux ${v.version}`;
      ver.replaceChildren(a);
    });
  }
  const mcp = $("foot-mcp");
  const pop = $("foot-mcp-pop");
  const box = $("foot-mcp-on");
  const copy = $("foot-mcp-copy");
  if (mcp && pop && box) {
    let on = false;
    let ringT = 0;
    const apply = (next) => {
      next = !!next;
      const was = on;
      on = next;
      box.checked = on;
      mcp.setAttribute("aria-pressed", String(on));
      mcp.classList.toggle("on", on);
      pop.classList.toggle("on", on);
      if (copy) copy.disabled = !on;
      if (on && !was) {
        mcp.classList.add("ring");
        clearTimeout(ringT);
        ringT = setTimeout(() => mcp.classList.remove("ring"), 1000);
      }
    };
    box.addEventListener("change", () => (typeof F.emit === "function" ? F.emit("mcp", { on: box.checked }) : apply(box.checked)));
    F.on?.("mcp", (d) => apply(d && d.on));
    F.on?.("mcp-show", () => {
      mcp.classList.remove("pulse");
      void mcp.offsetWidth;
      mcp.classList.add("pulse");
    });
    mcp.addEventListener("animationend", () => mcp.classList.remove("pulse"));
    const openPop = () => {
      pop.hidden = false;
      mcp.setAttribute("aria-expanded", "true");
      box.focus();
    };
    const closePop = (back) => {
      if (pop.hidden) return;
      pop.hidden = true;
      mcp.setAttribute("aria-expanded", "false");
      if (back) mcp.focus();
    };
    mcp.addEventListener("click", () => (pop.hidden ? openPop() : closePop(true)));
    document.addEventListener("pointerdown", (e) => {
      if (!pop.hidden && !pop.contains(e.target) && !mcp.contains(e.target)) closePop(false);
    });
    F.onKey?.(
      "escape",
      () => {
        closePop(true);
        return true;
      },
      { when: () => !pop.hidden },
    );
    copy?.addEventListener("click", () => F.copy?.(copy.dataset.copy, copy));
  }

  // ---- tier 3: the legend lights for the chords the page handles, and only those
  const legend = $("legend");
  if (legend && typeof F.onKey === "function") {
    const cells = [...legend.querySelectorAll("[data-keys]")];
    const timers = new Map();
    const light = (combo) => {
      const a = cells.find((c) => c.dataset.keys === combo);
      if (!a) return;
      a.classList.add("hit");
      clearTimeout(timers.get(a));
      timers.set(
        a,
        setTimeout(() => a.classList.remove("hit"), 600),
      );
    };
    // ⇧⇧ opens the palette, whose input has the focus by the time this hears the chord: that input is no veto
    const typing = () => {
      const a = document.activeElement;
      return !!a && a.id !== "se-input" && a.matches("input, textarea, select, [contenteditable=true]");
    };
    for (const combo of ["shift shift", "meta+enter", "shift+meta+i", "shift+meta+m", "alt+f12"]) {
      F.onKey(
        combo,
        () => {
          light(combo);
          return false;
        },
        { when: () => !typing() },
      );
    }
  }
})();

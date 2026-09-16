// The IDE's own tooltips: the name of a control and its shortcut, after a pause long enough
// that passing the mouse over a stripe does not set off a chain of them. One listener for
// the whole window, so a button opts in with `data-tip` rather than with a wrapper.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { placeTooltip } from "@/lib/tooltip";

const DELAY = 500;

interface Tip {
  text: string;
  shortcut?: string;
  anchor: { left: number; top: number; width: number; height: number };
}

export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const ref = useRef<HTMLDivElement>(null);
  // while one is up, the next appears at once: crossing a row of buttons should not stutter
  const showing = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let anchor: HTMLElement | null = null;

    const hide = () => {
      clearTimeout(timer);
      anchor = null;
      showing.current = false;
      setTip(null);
    };

    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-tip]") as HTMLElement | null;
      if (el === anchor) return;
      clearTimeout(timer);
      anchor = el;
      if (!el) return hide();
      const show = () => {
        const r = el.getBoundingClientRect();
        showing.current = true;
        setTip({
          text: el.dataset.tip ?? "",
          shortcut: el.dataset.tipKey,
          anchor: { left: r.left, top: r.top, width: r.width, height: r.height },
        });
      };
      if (showing.current) show();
      else timer = setTimeout(show, DELAY);
    };

    document.addEventListener("mouseover", over);
    document.addEventListener("mousedown", hide);
    window.addEventListener("blur", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mousedown", hide);
      window.removeEventListener("blur", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  // measured once it is in the document, then moved where it fits
  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos(placeTooltip(tip.anchor, { width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }));
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-[90] flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] whitespace-nowrap"
      style={{
        left: pos.left,
        top: pos.top,
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        boxShadow: "0 10px 28px rgba(0,0,0,.5)",
        color: "var(--text)",
      }}
    >
      {tip.text}
      {tip.shortcut && <span style={{ color: "var(--text-muted)" }}>{tip.shortcut}</span>}
    </div>
  );
}

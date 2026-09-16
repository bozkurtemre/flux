import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuItem {
  label?: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

/** A JetBrains popup menu: 24px rows, label left, shortcut right, thin separators. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [cursor, setCursor] = useState(-1);
  const selectable = items.map((it, i) => (it.separator || it.disabled ? -1 : i)).filter((i) => i >= 0);

  // keep the menu inside the window
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - r.width - 6),
      top: Math.min(y, window.innerHeight - r.height - 6),
    });
  }, [x, y]);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const at = selectable.indexOf(cursor);
        const next = e.key === "ArrowDown" ? at + 1 : at - 1;
        setCursor(selectable[(next + selectable.length) % selectable.length]);
      }
      if (e.key === "Enter" && cursor >= 0) {
        e.preventDefault();
        items[cursor].onClick?.();
        onClose();
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, cursor, items, selectable]);

  return (
    <div
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[60] min-w-[220px] overflow-hidden rounded-[6px] py-1"
      style={{
        left: pos.left,
        top: pos.top,
        background: "var(--bg-tool)",
        border: "1px solid var(--border)",
        boxShadow: "0 12px 32px rgba(0,0,0,.5)",
      }}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="my-1 h-px" style={{ background: "var(--border)" }} />
        ) : (
          <div
            key={i}
            onMouseEnter={() => !it.disabled && setCursor(i)}
            onClick={() => {
              if (it.disabled) return;
              it.onClick?.();
              onClose();
            }}
            className="mx-1 flex h-[24px] items-center gap-6 rounded px-2.5 text-[13px]"
            style={{
              background: cursor === i ? "var(--sel-focus)" : undefined,
              color: it.disabled ? "var(--text-muted)" : cursor === i ? "#fff" : it.danger ? "var(--red)" : "var(--text)",
              opacity: it.disabled ? 0.55 : 1,
            }}
          >
            <span className="truncate">{it.label}</span>
            {it.shortcut && (
              <span className="ml-auto shrink-0 text-[11px]" style={{ color: cursor === i ? "#cfe0ff" : "var(--text-muted)" }}>
                {it.shortcut}
              </span>
            )}
          </div>
        ),
      )}
    </div>
  );
}

/** JetBrains confirmation: a short question, Cancel and a primary action. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: "rgba(0,0,0,.45)" }} onMouseDown={onCancel}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[420px] rounded-[10px] p-4"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--text-dim)" }}>
          {message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-[26px] rounded-[4px] px-3 text-[13px]"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="h-[26px] rounded-[4px] px-3 text-[13px]"
            style={{ background: "var(--red)", border: "1px solid var(--red)", color: "#fff" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

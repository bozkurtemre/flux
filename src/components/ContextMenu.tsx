import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  label?: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  danger?: boolean;
  /** Drawn with a tick, for a row that names the current choice. */
  checked?: boolean;
  /** A row that opens another menu beside it rather than doing something. */
  items?: MenuItem[];
  onClick?: () => void;
}

/** A JetBrains popup menu: 24px rows, label left, shortcut right, thin separators. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [cursor, setCursor] = useState(-1);
  const [openSub, setOpenSub] = useState<{ index: number; left: number; top: number } | null>(null);
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
            onMouseEnter={(e) => {
              if (it.disabled) return;
              setCursor(i);
              const row = e.currentTarget.getBoundingClientRect();
              const panel = ref.current?.getBoundingClientRect();
              setOpenSub(it.items ? { index: i, left: (panel?.right ?? row.right) - 4, top: row.top - 5 } : null);
            }}
            onClick={() => {
              if (it.disabled || it.items) return;
              it.onClick?.();
              onClose();
            }}
            className="mx-1 flex h-[24px] items-center gap-2 rounded px-2.5 text-[13px]"
            style={{
              background: cursor === i ? "var(--sel-focus)" : undefined,
              color: it.disabled ? "var(--text-muted)" : cursor === i ? "#fff" : it.danger ? "var(--red)" : "var(--text)",
              opacity: it.disabled ? 0.55 : 1,
            }}
          >
            <span className="w-3 shrink-0 text-[11px]">{it.checked ? "✓" : ""}</span>
            <span className="truncate">{it.label}</span>
            {it.shortcut && (
              <span className="ml-auto shrink-0 text-[11px]" style={{ color: cursor === i ? "#cfe0ff" : "var(--text-muted)" }}>
                {it.shortcut}
              </span>
            )}
            {it.items && <span className="ml-auto shrink-0 text-[10px]">▸</span>}
          </div>
        ),
      )}
      {openSub && items[openSub.index]?.items && (
        <ContextMenu x={openSub.left} y={openSub.top} items={items[openSub.index].items!} onClose={onClose} />
      )}
    </div>
  );
}

/** JetBrains confirmation: a short question, Cancel and a primary action. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  extra,
  onConfirm,
  onCancel,
  onDismiss,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** False when the confirming button is not destroying anything. */
  danger?: boolean;
  /** A control that belongs to the question itself, such as "do not ask again". */
  extra?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  /** Escape and the backdrop, when walking away is not the same as the cancel button. */
  onDismiss?: () => void;
}) {
  const dismiss = onDismiss ?? onCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss, onConfirm]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: "rgba(0,0,0,.45)" }} onMouseDown={dismiss}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[420px] rounded-[10px] p-4"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--text-dim)" }}>
          {message}
        </p>
        {extra && <div className="mt-3">{extra}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-[26px] rounded-[4px] px-3 text-[13px]"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="h-[26px] rounded-[4px] px-3 text-[13px]"
            style={
              danger
                ? { background: "var(--red)", border: "1px solid var(--red)", color: "#fff" }
                : { background: "var(--accent)", border: "1px solid var(--accent)", color: "var(--accent-text)" }
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

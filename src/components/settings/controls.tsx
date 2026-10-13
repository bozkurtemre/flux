import { createContext, useState, type ReactNode } from "react";
import { ContextMenu } from "../ContextMenu";
import { Check, ChevronDown } from "lucide-react";

/**
 * True while the pages are rendered out of sight so their text can be searched. A page that
 * fetches something when it opens holds off: being searched is not being opened.
 */
export const Indexing = createContext(false);

/** A settings row: a right-aligned label in a fixed column, the control beside it. */
export function Row({ label, children, hint }: { label?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3 py-[3px]">
      <span className="w-[150px] shrink-0 pt-[3px] text-right text-[13px]" style={{ color: label ? "var(--text)" : "transparent" }}>
        {label}
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        {children}
        {hint && (
          <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
          {title}
        </span>
        <span className="h-px flex-1" style={{ background: "var(--border)" }} />
      </div>
      <div className="pl-1">{children}</div>
    </section>
  );
}

export function Checkbox({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div>
      <label className="flex items-start gap-2">
        <span
          onClick={() => onChange(!checked)}
          className="mt-[1px] flex size-[15px] shrink-0 items-center justify-center rounded-[3px]"
          style={{
            background: checked ? "var(--accent)" : "var(--bg-input)",
            border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
          }}
        >
          {checked && <Check size={11} strokeWidth={3} color="#fff" />}
        </span>
        <span className="text-[13px] leading-[17px]" onClick={() => onChange(!checked)}>
          {label}
        </span>
      </label>
      {hint && (
        <p className="mt-0.5 ml-[23px] text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  width = 210,
}: {
  value: T;
  onChange: (v: T) => void;
  /** With an icon on each option, the box and its list draw them; a native select cannot. */
  options: { value: T; label: string; icon?: ReactNode }[];
  width?: number;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const current = options.find((o) => o.value === value);
  if (options.some((o) => o.icon)) {
    return (
      <span className="relative inline-block max-w-full" style={{ width }}>
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu(menu ? null : { x: r.left, y: r.bottom + 4 });
          }}
          className="flex h-[26px] w-full items-center gap-2 rounded-[4px] pr-6 pl-2 text-left text-[13px] outline-none"
          style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          {current?.icon}
          <span className="truncate">{current?.label ?? String(value)}</span>
        </button>
        <ChevronDown size={12} className="pointer-events-none absolute top-[7px] right-2" style={{ color: "var(--text-dim)" }} />
        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            items={options.map((o) => ({
              label: o.label,
              icon: o.icon,
              shortcut: o.value === value ? "✓" : undefined,
              onClick: () => onChange(o.value),
            }))}
          />
        )}
      </span>
    );
  }
  return (
    <span className="relative inline-block max-w-full" style={{ width }}>
      <select
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o.value) === raw);
          onChange((match ? match.value : raw) as T);
        }}
        className="h-[26px] w-full appearance-none rounded-[4px] pr-6 pl-2 text-[13px] outline-none"
        style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)" }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute top-[7px] right-2" style={{ color: "var(--text-dim)" }} />
    </span>
  );
}

export function Text({
  value,
  onChange,
  width = "100%",
  placeholder,
  type,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  width?: number | string;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      type={type}
      spellCheck={false}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="selectable h-[26px] min-w-0 max-w-full rounded-[4px] px-2 text-[13px] outline-none focus:border-[var(--accent)]"
      style={{
        width,
        background: "var(--bg-input)",
        border: "1px solid var(--border)",
        color: "var(--text)",
        fontFamily: mono ? "var(--font-mono)" : undefined,
      }}
    />
  );
}

export function Num({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  width = 90,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  width?: number;
}) {
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="selectable h-[26px] rounded-[4px] px-2 text-[13px] tabular-nums outline-none focus:border-[var(--accent)]"
        style={{ width, background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)" }}
      />
      {suffix && (
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {suffix}
        </span>
      )}
    </span>
  );
}

export function Swatches({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colors = ["#3574f0", "#5fad65", "#d9a343", "#e55765", "#c77dbb", "#2aacb8", "#8f8f8f"];
  return (
    <span className="flex items-center gap-1">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          data-tip={c}
          // the ring is a border rather than an outline, so it sits inside the button's own
          // box and the next swatch cannot paint over it
          className="grid size-[26px] shrink-0 place-items-center rounded-full"
          style={{ border: `2px solid ${value === c ? "var(--text)" : "transparent"}` }}
        >
          <span className="size-[18px] rounded-full" style={{ background: c }} />
        </button>
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ml-1 size-[20px] cursor-pointer rounded border-0 bg-transparent p-0"
        data-tip="Custom colour"
      />
    </span>
  );
}

export function Button({
  children,
  onClick,
  primary,
  disabled,
  tip,
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  /** Said on hover, for a button that is only an icon. */
  tip?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-tip={tip}
      className="h-[26px] rounded-[4px] px-3 text-[13px] disabled:opacity-40"
      style={
        primary
          ? { background: "var(--accent)", color: "#fff", border: "1px solid var(--accent)" }
          : { background: "var(--bg-raised)", color: "var(--text)", border: "1px solid var(--border)" }
      }
    >
      {children}
    </button>
  );
}

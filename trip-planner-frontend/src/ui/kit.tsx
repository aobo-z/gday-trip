import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type MouseEvent } from "react";
import { useSlide } from "./slide";
import { ICONS } from "./icons";
import { initials, userColor } from "../lib/format";
import { FX, still } from "../lib/theme";

export function Icon({ n, s = 18, className, style }: { n: string; s?: number; className?: string; style?: CSSProperties }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" className={className} style={style} dangerouslySetInnerHTML={{ __html: ICONS[n] ?? "" }} />;
}

export function Avatar({ id, name, size, onClick, title }: { id: number; name: string; size?: number; onClick?: (e: MouseEvent) => void; title?: string }) {
  const style: CSSProperties = { background: userColor(id), ...(size ? { width: size, height: size, fontSize: Math.round(size * 0.36) } : {}) };
  if (!onClick) return <span className="avatar" style={style} title={title ?? name}>{initials(name)}</span>;
  return <button type="button" className="avatar" style={style} title={title ?? name} aria-label={name + " profile"} onClick={(e) => { e.stopPropagation(); onClick(e); }}>{initials(name)}</button>;
}

export function Stack({ people, max = 5 }: { people: { id: number; name: string }[]; max?: number }) {
  return <span className="stack">
    {people.slice(0, max).map((p) => <Avatar key={p.id} id={p.id} name={p.name} />)}
    {people.length > max && <span className="avatar" style={{ background: "var(--hover)", color: "var(--ink-2)" }}>+{people.length - max}</span>}
  </span>;
}

export function Chip({ text, cls = "c-plain", icon, title }: { text: ReactNode; cls?: string; icon?: string; title?: string }) {
  return <span className={"chip " + cls} title={title}>{icon && <Icon n={icon} s={13} />}{text}</span>;
}

export function Empty({ icon, text, children }: { icon: string; text: string; children?: ReactNode }) {
  return <div className="empty"><span className="ico"><Icon n={icon} s={24} /></span><span>{text}</span>{children}</div>;
}

export function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return <span className="stars ro" aria-label={n + " of 5"}>
    {[1, 2, 3, 4, 5].map((i) => <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={i <= Math.round(n) ? "on" : ""} dangerouslySetInnerHTML={{ __html: ICONS.star }} />)}
  </span>;
}

export type SegOption<T extends string> = [T, ReactNode, number?];
export function Seg<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: SegOption<T>[]; onChange: (v: T) => void }) {
  const box = useSlide("seg-" + name, [value]);
  return <div className="seg" role="group" ref={box} data-seg={name}>
    {options.map(([v, label, n]) => <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>{label}{n != null && <span className="n num">{n}</span>}</button>)}
  </div>;
}

/* ---------- CountUp: animates from the value last shown under the same key ---------- */
const counted: Record<string, number> = {};
export function CountUp({ value, k, format }: { value: number; k: string; format?: (v: number) => string }) {
  const f = format ?? ((v: number) => String(Math.round(v)));
  const ref = useRef<HTMLSpanElement>(null);
  const from = counted[k] ?? 0;
  useEffect(() => {
    counted[k] = value;
    const el = ref.current; if (!el) return;
    if (Math.abs(from - value) < 1e-6 || still() || document.hidden) { el.textContent = f(value); return; }
    const t0 = performance.now(); let raf = 0;
    const step = (now: number) => { const p = Math.min(1, (now - t0) / 720), e = 1 - Math.pow(1 - p, 4); el.textContent = f(from + (value - from) * e); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref}>{f(from)}</span>;
}

export function FxCanvas({ k = "theme", card }: { k?: string; card?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; return FX.mount(el, k, !!card); }, [k, card]);
  return <canvas ref={ref} className="fx" aria-hidden="true" />;
}

/** Destructive actions: press and hold until the fill reaches the end. */
export function HoldButton({ label, icon = "trash", onConfirm, className = "btn btn-danger" }: { label: string; icon?: string; onConfirm: () => void; className?: string }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number>(0);
  const start = () => { setHolding(true); timer.current = window.setTimeout(() => { setHolding(false); onConfirm(); }, still() ? 0 : 900); };
  const end = () => { clearTimeout(timer.current); setHolding(false); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const inner = <span className="hold-label"><Icon n={icon} s={16} />Hold to {label.toLowerCase()}</span>;
  return <button type="button" className={className + " hold" + (holding ? " holding" : "")} autoFocus
    onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); start(); } }} onPointerUp={end} onPointerLeave={end} onPointerCancel={end}
    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); start(); } }} onKeyUp={end}>
    {inner}<span className="hold-fill" aria-hidden="true">{inner}</span>
  </button>;
}

export function Spinner({ s = 18 }: { s?: number }) { return <Icon n="loader" s={s} className="spin" />; }
export function FieldErr({ msg }: { msg?: string }) { return <div className="err" aria-live="polite">{msg ?? ""}</div>; }

/** A request failed: say so (not "nothing here") and offer to try again. */
export function LoadError({ text, onRetry, compact }: { text: string; onRetry: () => void; compact?: boolean }) {
  return <div className={"empty load-error" + (compact ? " compact" : "")} role="alert"><Icon n="alert" s={compact ? 18 : 22} /><span>{text}</span>
    <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}><Icon n="refresh" s={15} />Retry</button></div>;
}

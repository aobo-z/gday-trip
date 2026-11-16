import type { PointerEvent as RPointerEvent } from "react";
import { fromMin, fwd, pd, toMin } from "../lib/format";

export interface Slot { date: string; start: string; end: string }
const LO = 6 * 60, HI = 23 * 60, STEP = 15, MIN_LEN = 30;
const PRESETS: [string, number, number][] = [["Morning", 9 * 60, 12 * 60], ["Afternoon", 13 * 60, 17 * 60], ["Evening", 18 * 60, 21 * 60]];
const pct = (m: number) => ((m - LO) / (HI - LO)) * 100;
const snap = (m: number) => Math.min(HI, Math.max(LO, Math.round(m / STEP) * STEP));

/**
 * A day, then a time range on one track from 06:00 to 23:00: drag either end, tap the track to move the nearer end,
 * or tap Morning / Afternoon / Evening. With `none`, the first day choice means "no time yet" (date "").
 */
export function SlotPicker({ days, value, onChange, none }: { days: string[]; value: Slot; onChange: (v: Slot) => void; none?: boolean }) {
  const s = snap(toMin(value.start || "10:00")), e = Math.max(s + MIN_LEN, snap(toMin(value.end || "12:00")));
  const set = (a: number, b: number) => onChange({ ...value, start: fromMin(a), end: fromMin(b) });
  const setStart = (a: number) => set(Math.min(a, e - MIN_LEN), e);
  const setEnd = (b: number) => set(s, Math.max(b, s + MIN_LEN));
  /* The inputs only catch their thumbs; a tap elsewhere on the track moves whichever end is nearer. */
  const tap = (ev: RPointerEvent<HTMLDivElement>) => {
    if ((ev.target as HTMLElement).tagName === "INPUT") return;
    const r = ev.currentTarget.getBoundingClientRect(), m = snap(LO + ((ev.clientX - r.left) / r.width) * (HI - LO));
    if (Math.abs(m - s) <= Math.abs(m - e)) setStart(m); else setEnd(m);
  };
  return <div className="slot-pick">
    <div className="slot-days" role="group" aria-label="Day">
      {none && <button type="button" className="slot-day later" aria-pressed={!value.date} onClick={() => onChange({ ...value, date: "" })}><span>No time</span><b>—</b></button>}
      {days.map((d) => <button key={d} type="button" className="slot-day" aria-pressed={value.date === d} aria-label={fwd(d) + " " + pd(d).getDate()} onClick={() => onChange({ ...value, date: d })}>
        <span>{fwd(d)}</span><b className="num">{pd(d).getDate()}</b></button>)}
    </div>
    {(value.date || !none) && <>
      <div className="slot-head"><b className="slot-range num" aria-live="polite">{fromMin(s)} – {fromMin(e)}</b>
        <span className="slot-presets">{PRESETS.map(([label, a, b]) => <button key={label} type="button" className="slot-preset" aria-pressed={s === a && e === b} onClick={() => set(a, b)}>{label}</button>)}</span></div>
      <div className="slot-track" onPointerDown={tap} style={{ "--a": pct(s) + "%", "--b": pct(e) + "%" } as React.CSSProperties}>
        <i className="slot-fill" />
        <input type="range" min={LO} max={HI} step={STEP} value={s} aria-label="From" aria-valuetext={fromMin(s)} onChange={(x) => setStart(Number(x.target.value))} />
        <input type="range" min={LO} max={HI} step={STEP} value={e} aria-label="To" aria-valuetext={fromMin(e)} onChange={(x) => setEnd(Number(x.target.value))} />
      </div>
      <div className="slot-ticks num" aria-hidden="true">{[6, 9, 12, 15, 18, 21, 23].map((h) => <span key={h} style={{ left: pct(h * 60) + "%" }}>{String(h).padStart(2, "0")}</span>)}</div>
    </>}
  </div>;
}

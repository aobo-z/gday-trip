import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchActivityPreferences, type ActivityPreferencesResponse, type ActivityResponse } from "../api/activityApi";
import { expenseApi } from "../api/expenseApi";
import { apiErrorMessage } from "../api/apiError";
import { useMe, useTrip } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { DlgHead } from "../ui/Overlay";
import { Empty, FieldErr, Icon, LoadError, Seg } from "../ui/kit";
import { useLoad } from "../lib/useLoad";
import { useSlide } from "../ui/slide";
import { canPlace, catIcon, catKey, clash, editable, ideaKind, isScheduled } from "../lib/domain";
import { MON, daysBetween, fd, fdy, frange, fromMin, fwd, hm, iso, money, nowTime, pd, plural, sum, toMin, today } from "../lib/format";
import { EASE, still } from "../lib/theme";
import { removeActivity, schedulePlan } from "../lib/actions";
import { Timeline } from "../parts/TripBits";
import { H0, H1, dayActs, scrollTimeline, type Jump } from "../lib/timeline";
import { BranchDialog } from "../parts/PlanDialogs";
import { usePeek } from "../parts/usePeek";

const SNAP = 15;
interface Slot { date: string; start: string; end: string; count: number }
/** Preferred times as bands; time-less preferences count for the whole day but have no band. */
function slotsOf(p: ActivityPreferencesResponse | undefined): Slot[] {
  return (p?.slots ?? []).filter((s) => s.preferredStartTime && s.preferredEndTime)
    .map((s) => ({ date: s.preferredDate, start: hm(s.preferredStartTime), end: hm(s.preferredEndTime), count: s.memberCount }))
    .sort((a, b) => b.count - a.count);
}

interface Drag {
  kind: "ev" | "pool"; a: ActivityResponse; mode: "move" | "resize"; el: HTMLElement; x0: number; y0: number; lx: number; ly: number; pid: number; touch: boolean; on: boolean; timer?: number;
  float?: HTMLElement; slot?: HTMLElement; grid?: HTMLElement | null; tl?: HTMLElement | null; offX?: number; offY?: number;
  s0?: number; e0?: number; dur: number; ht0?: number; downY?: number; lo?: number; hi?: number;
  toDay?: string | null; toPool?: boolean; toTrash?: boolean; ns?: number | null; ne?: number | null; day?: string | null; slots: Slot[];
}

function ExportDialog() {
  const { trip, activities, name } = useTrip(), me = useMe(), o = useOverlay();
  const [err, setErr] = useState("");
  /* Only what I'm going to: group plans I haven't left and branches I picked. */
  const ev = activities.filter((a) => isScheduled(a) && a.endTime && a.memberIds.includes(me.userId))
    .sort((a, b) => (a.date! + a.startTime) < (b.date! + b.startTime) ? -1 : 1);
  const esc = (s: string | null | undefined) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const fold = (line: string) => { const out: string[] = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = " " + line.slice(74); } out.push(line); return out.join("\r\n"); };
  const dt = (d: string, t: string) => d.replace(/-/g, "") + "T" + hm(t).replace(":", "") + "00";
  const download = () => {
    if (!ev.length) return setErr("You're not going to any scheduled plans yet");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//G'Day Trip//Trip planner//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + esc(trip.name)];
    ev.forEach((a) => {
      const desc = [a.description, a.memberIds.length ? "Going: " + a.memberIds.map(name).join(", ") : ""].filter(Boolean).join("\n");
      L.push("BEGIN:VEVENT", `UID:gday-${trip.tripId}-${a.id}@gdaytrip`, "DTSTAMP:" + stamp, "DTSTART:" + dt(a.date!, a.startTime!), "DTEND:" + dt(a.date!, a.endTime!), "SUMMARY:" + esc((a.branch ? "Branch · " : "") + a.name));
      if (a.location) L.push("LOCATION:" + esc(a.location));
      if (desc) L.push("DESCRIPTION:" + esc(desc));
      L.push("CATEGORIES:" + esc(a.category));
      if (a.latitude != null && a.longitude != null) L.push(`GEO:${a.latitude.toFixed(5)};${a.longitude.toFixed(5)}`);
      L.push("END:VEVENT");
    });
    L.push("END:VCALENDAR");
    const url = URL.createObjectURL(new Blob([L.map(fold).join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" })), link = document.createElement("a");
    link.href = url; link.download = (trip.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trip") + ".ics";
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    o.closeDialog(); o.toast(plural(ev.length, "event") + " exported");
  };
  return <div className="dlg-body">
    <DlgHead title="Export calendar" onClose={o.closeDialog} />
    <div className="preview"><div className="kv"><span><Icon n="cal" s={14} /> Events</span><span className="num">{ev.length}</span></div>
      {ev.length > 0 && <div className="kv"><span><Icon n="clock" s={14} /> Dates</span><span className="num">{frange(ev[0].date!, ev[ev.length - 1].date!)}</span></div>}</div>
    <FieldErr msg={err} />
    <div className="dlg-foot"><button type="button" className="btn btn-ghost" onClick={o.closeDialog}>Cancel</button><button type="button" className="btn btn-primary" onClick={download}><Icon n="download" s={16} />Download .ics</button></div>
  </div>;
}

const fmtDur = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return (h ? h + "h" : "") + (h && r ? " " : "") + (r ? r + "m" : ""); };
/** Calendar mode is read-only: month grid plus the chosen day's agenda. */
function MonthCal({ day, onPick }: { day: string; onPick: (d: string) => void }) {
  const { trip, activities } = useTrip();
  const [month, setMonth] = useState(day.slice(0, 7));
  const first = pd(month + "-01"), offset = (first.getDay() + 6) % 7, last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(), total = Math.ceil((offset + last) / 7) * 7;
  const start = new Date(first); start.setDate(1 - offset);
  const box = useSlide("mcal", [day, month]);
  const step = (d: number) => { const x = pd(month + "-01"); x.setMonth(x.getMonth() + d); setMonth(iso(x).slice(0, 7)); };
  return <section className="card pad"><div className="sec-head" style={{ marginBottom: 14 }}><h3>{MON[first.getMonth()]} {first.getFullYear()}</h3>
    <span style={{ display: "flex", gap: 4 }}><button type="button" className="icon-btn sm" aria-label="Previous month" onClick={() => step(-1)}><Icon n="left" /></button><button type="button" className="icon-btn sm" aria-label="Next month" onClick={() => step(1)}><Icon n="right" /></button></span></div>
    <div className="mwd">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <span key={w}>{w}</span>)}</div>
    <div className="mgrid" ref={box}>{Array.from({ length: total }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); const s = iso(d), inR = s >= trip.startDate && s <= trip.endDate;
      const acts = dayActs(activities, s), shown = [...acts.filter((a) => !a.branch), ...acts.filter((a) => a.branch)].slice(0, 3);
      return <button key={s} type="button" className={"mcell" + (inR ? " in" : "") + (d.getMonth() !== first.getMonth() ? " other" : "") + (s === today() ? " today" : "")} aria-pressed={s === day} disabled={!inR} onClick={() => onPick(s)}
        aria-label={fdy(s) + (acts.length ? `, ${plural(acts.length, "plan")}` : "")}><span className="mc-head"><b className="num">{d.getDate()}</b></span>
        {shown.map((a) => <span key={a.id} className={"mc-ev" + (a.branch ? " alt" : "")} title={`${hm(a.startTime)}–${hm(a.endTime)} ${a.name}`}><i className={"dot-" + catKey(a.category)} /><span className="mc-name">{a.name}</span></span>)}
        {acts.length > shown.length && <span className="mc-more num">+{acts.length - shown.length}</span>}</button>;
    })}</div></section>;
}
function Agenda({ day, onTimeline }: { day: string; onTimeline: () => void }) {
  const { activities } = useTrip(), peek = usePeek();
  const acts = dayActs(activities, day), nowM = toMin(nowTime());
  const row = (a: ActivityResponse) => <div key={a.id} className={"ag-item" + (a.branch ? " direct" : "")} tabIndex={0} role="button" onClick={() => peek.plan(a.id)} onKeyDown={(e) => { if (e.key === "Enter") peek.plan(a.id); }}>
    <span className="ag-time num">{hm(a.startTime)}</span><span className={"ag-dot " + (a.branch ? "" : "dot-" + catKey(a.category))} />
    <span className="ag-body"><strong>{a.branch && <><Icon n="branch" s={14} /> </>}{a.name}</strong><span className="ag-meta num">{hm(a.startTime)}–{hm(a.endTime)} · {fmtDur(toMin(a.endTime ?? a.startTime!) - toMin(a.startTime!))}</span></span></div>;
  let nowShown = day !== today();
  const items: React.ReactNode[] = [];
  acts.forEach((a) => {
    if (!nowShown && toMin(a.startTime!) > nowM) { items.push(<div key="now" className="ag-now"><b className="num">{nowTime()}</b><i /></div>); nowShown = true; }
    items.push(row(a));
  });
  if (!nowShown && acts.length) items.push(<div key="now" className="ag-now"><b className="num">{nowTime()}</b><i /></div>);
  return <section className="card pad"><div className="sec-head" style={{ marginBottom: 12 }}><h3>{fwd(day)} {fd(day)}<span className="n num">{acts.length}</span></h3>
    <button type="button" className="icon-btn sm" aria-label="Open in timeline" onClick={onTimeline}><Icon n="clock" s={17} /></button></div>
    {acts.length ? <div className="agenda">{items}</div> : <Empty icon="cal" text="Free day" />}</section>;
}

export default function Schedule() {
  const store = useTrip(), o = useOverlay(), peek = usePeek(), nav = useNavigate(), loc = useLocation();
  const { trip: t, activities } = store, can = editable(t);
  const jump = loc.state as Jump | null;
  const inTrip = today() >= t.startDate && today() <= t.endDate;
  const [day, setDay] = useState(jump?.day ?? (inTrip ? today() : t.startDate));
  const [mode, setMode] = useState<"grid" | "cal">("grid");
  const [prefs, setPrefs] = useState<Record<number, ActivityPreferencesResponse>>({});
  const [hover, setHover] = useState<number | null>(null);
  const tl = useRef<HTMLDivElement>(null), grid = useRef<HTMLDivElement>(null), DR = useRef<Drag | null>(null), noClick = useRef(false);
  const days = daysBetween(t.startDate, t.endDate);
  const daysBox = useSlide("days", [day, mode]);

  const pool = activities.filter((a) => ideaKind(a) === "approved");
  const branches = activities.filter((a) => a.branch && !isScheduled(a));
  const voting = activities.filter((a) => { const k = ideaKind(a); return k === "needs" || k === "voting"; }).length;
  const acts = dayActs(activities, day);

  /* Preferences live per activity; load them for everything waiting to be scheduled. */
  const waitingKey = [...pool, ...branches].map((a) => a.id).sort().join(",");
  useEffect(() => {
    const ids = waitingKey ? waitingKey.split(",").map(Number) : [];
    Promise.all(ids.map((id) => fetchActivityPreferences(id).then((p) => [id, p] as const).catch(() => null)))
      .then((list) => setPrefs(Object.fromEntries(list.filter((x): x is readonly [number, ActivityPreferencesResponse] => !!x))));
  }, [waitingKey]);
  const exp = useLoad(() => expenseApi.list(t.tripId), [t.tripId], "Couldn't load the day's spending."), expenses = exp.data ?? [];
  useEffect(() => { if (mode === "grid") scrollTimeline(tl.current); }, [day, mode]);
  /* Opened from an idea: go to its day (decided while rendering, when a new navigation arrives), then scroll to its
     time and ring it once (the event, or the list item with its preferred times shown). */
  const [seen, setSeen] = useState(loc.key);
  if (seen !== loc.key) { setSeen(loc.key); if (jump?.focus) { setMode("grid"); if (jump.day) setDay(jump.day); } }
  useEffect(() => {
    if (!jump?.focus) return;
    const id = jump.focus;
    const timer = window.setTimeout(() => {
      nav(loc.pathname, { replace: true, state: null });
      if (tl.current && jump.time) tl.current.scrollTo({ top: Math.max(0, (toMin(jump.time) / 60 - H0) * 64 - 48), behavior: "instant" });
      const el = document.querySelector<HTMLElement>(jump.scheduled ? `[data-ev="${id}"]` : `[data-pool-item="${id}"]`);
      if (!el) return;
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      el.classList.remove("arrive"); void el.offsetWidth; el.classList.add("arrive");
    }, 120);
    return () => clearTimeout(timer);
  }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const slotsFor = useCallback((a: ActivityResponse) => slotsOf(prefs[a.id]), [prefs]);
  /* While something is dragged a bin appears for whoever may delete it; dropping there asks before deleting.
     Taking a branch back to voting is a button on the branch, not the bin. */
  const [dragging, setDragging] = useState<ActivityResponse | null>(null);
  const canTrash = (a: ActivityResponse) => a.canModify;

  /* ---------- Drag to schedule ----------
     Events: drag to move (15 min snap), bottom edge to resize, onto a date to change day, onto the matching list to unschedule,
     onto the bin to delete (after a confirm).
     List items: drag onto the timeline or a date, or onto the bin. Touch needs a long press so scrolling keeps working. */
  const canDrag = useCallback((a: ActivityResponse) => canPlace(t, a), [t]);
  const begin = (e: RPointerEvent<HTMLElement>, a: ActivityResponse, kind: "ev" | "pool", m: "move" | "resize") => {
    if (e.button !== 0 || DR.current) return;
    const d: Drag = { kind, a, mode: m, el: (kind === "ev" ? (e.currentTarget.closest(".ev") as HTMLElement) : e.currentTarget), x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, pid: e.pointerId, touch: e.pointerType === "touch", on: false, dur: 90, slots: [] };
    DR.current = d;
    if (d.touch) d.timer = window.setTimeout(() => { if (DR.current === d && !d.on) { start(); move(d.lx, d.ly); } }, 350);
  };
  const start = () => {
    const d = DR.current!, a = d.a, el = d.el, r = el.getBoundingClientRect();
    d.on = true; if (d.touch) navigator.vibrate?.(8);
    d.slots = slotsFor(a); setHover(a.id); if (d.mode !== "resize" && canTrash(a)) setDragging(a);
    const g = grid.current;
    if (d.kind === "ev") {
      d.s0 = toMin(a.startTime!); d.e0 = toMin(a.endTime ?? fromMin(d.s0 + 60)); d.dur = d.e0 - d.s0;
      d.grid = g; d.tl = tl.current;
      if (g) {
        d.ht0 = el.offsetHeight; d.downY = d.y0 - g.getBoundingClientRect().top;
        d.lo = d.mode === "resize" ? d.s0 + SNAP : H0 * 60; d.hi = H1 * 60;
        d.slot = document.createElement("div"); d.slot.className = "ev-slot"; d.slot.hidden = true; d.slot.style.left = el.style.left; d.slot.style.width = el.style.width; g.appendChild(d.slot);
      }
      if (d.mode === "resize") { el.classList.add("dragging"); return; }
    } else {
      const s = d.slots[0]; d.dur = s ? toMin(s.end) - toMin(s.start) : 90;
      d.grid = g; d.tl = tl.current;
      if (g) { d.slot = document.createElement("div"); d.slot.className = "ev-slot"; d.slot.hidden = true; d.slot.style.left = "52px"; d.slot.style.right = "6px"; g.appendChild(d.slot); }
    }
    if (d.tl) d.tl.style.scrollBehavior = "auto";
    d.offX = d.x0 - r.left; d.offY = d.y0 - r.top;
    const f = el.cloneNode(true) as HTMLElement;
    f.classList.add("drag-float"); f.style.cssText = `width:${r.width}px;height:${r.height}px;transform:translate(${r.left}px,${r.top}px)`;
    document.body.appendChild(f); d.float = f; el.classList.add("lifting");
  };
  const target = (x: number, y: number) => {
    const d = DR.current!, hit = document.elementFromPoint(x, y), overPool = hit?.closest("[data-pool-drop]"), bin = hit?.closest("[data-trash]");
    const poolEl = overPool && d.kind === "ev" ? document.querySelector(`[data-pool-drop="${d.a.branch ? "branches" : "ideas"}"]`) : null;
    const b = bin ?? poolEl ?? (!overPool ? hit?.closest(".days button[data-v]") : null);
    document.querySelectorAll(".drop").forEach((x2) => { if (x2 !== b) x2.classList.remove("drop"); });
    b?.classList.add("drop");
    return bin ? { trash: true } : poolEl ? { pool: true } : b ? { day: (b as HTMLElement).dataset.v! } : {};
  };
  const slotAt = (ns: number, ne: number, bad: boolean) => {
    const d = DR.current!, pxh = Number(d.grid!.dataset.pxh); if (!d.slot) return;
    d.slot.hidden = false; d.slot.style.top = (ns / 60 - H0) * pxh + "px"; d.slot.style.height = Math.max(30, (ne - ns) / 60 * pxh - 4) + "px"; d.slot.classList.toggle("bad", bad);
  };
  const landing = (x: number, y: number) => {
    const d = DR.current!; if (!d.grid || !d.tl) return null;
    const g = d.grid.getBoundingClientRect(), tr = d.tl.getBoundingClientRect();
    if (x < g.left || x > g.right || y < tr.top || y > tr.bottom) return null;
    const p = Number(d.grid.dataset.pxh), raw = H0 * 60 + (y - d.offY! - g.top) / p * 60; let v = Math.round(raw / SNAP) * SNAP;
    d.slots.forEach((s) => { if (s.date === day && Math.abs(toMin(s.start) - raw) <= 20) v = toMin(s.start); });
    return Math.min(H1 * 60 - d.dur, Math.max(H0 * 60, v));
  };
  const autoScroll = (x: number, y: number) => {
    const d = DR.current!; if (!d.tl) return; const r = d.tl.getBoundingClientRect();
    if (x < r.left || x > r.right) return;
    if (y < r.top + 36 && y > r.top - 40) d.tl.scrollTop -= Math.ceil((r.top + 36 - y) / 4);
    else if (y > r.bottom - 36 && y < r.bottom + 40) d.tl.scrollTop += Math.ceil((y - r.bottom + 36) / 4);
  };
  const damp = (v: number, lo: number, hi: number) => v < lo ? lo - (lo - v) * 0.25 : v > hi ? hi + (v - hi) * 0.25 : v;
  const move = (x: number, y: number) => {
    const d = DR.current!, a = d.a; autoScroll(x, y);
    if (d.kind === "ev" && d.mode === "resize") {
      const r = d.grid!.getBoundingClientRect(), pxh = Number(d.grid!.dataset.pxh), rawE = d.e0! + (y - r.top - d.downY!) / pxh * 60;
      d.ns = d.s0!; d.ne = Math.min(d.hi!, Math.max(d.lo!, Math.round(rawE / SNAP) * SNAP));
      d.el.style.height = Math.max(30, (damp(rawE, d.lo!, d.hi!) - d.s0!) / 60 * pxh - 4) + "px";
      const lb = d.el.querySelector(".t"); if (lb) lb.textContent = fromMin(d.ns) + "–" + fromMin(d.ne);
      slotAt(d.ns, d.ne, !!clash(activities, a, a.date!, fromMin(d.ns), fromMin(d.ne)));
      return;
    }
    d.float!.style.transform = `translate(${x - d.offX!}px,${y - d.offY!}px)`;
    const tg = target(x, y);
    d.toPool = !!tg.pool; d.toTrash = !!tg.trash; d.toDay = tg.day && (d.kind === "pool" || tg.day !== a.date) ? tg.day : null;
    const s = tg.pool || tg.day || tg.trash ? null : landing(x, y);
    d.ns = s; d.ne = s == null ? null : s + d.dur; d.day = day;
    const label = d.float!.querySelector(".t, small");
    if (label) label.textContent = d.toTrash ? "Delete" : d.toPool ? "Back to the list" : d.toDay ? fwd(d.toDay) + " " + fd(d.toDay) : s != null ? fromMin(s) + "–" + fromMin(s + d.dur) : d.kind === "ev" ? hm(a.startTime) + "–" + hm(a.endTime) : "";
    if (s == null) { if (d.slot) d.slot.hidden = true; return; }
    slotAt(s, s + d.dur, !!clash(activities, a, day, fromMin(s), fromMin(s + d.dur)));
  };
  const cleanup = () => {
    const d = DR.current; if (!d) return;
    d.slot?.remove(); if (d.tl) d.tl.style.scrollBehavior = "";
    document.querySelectorAll(".drop").forEach((x) => x.classList.remove("drop"));
    setHover(null); setDragging(null); DR.current = null;
  };
  const back = () => {
    const d = DR.current!, el = d.el;
    if (d.kind === "ev" && d.mode === "resize") {
      const h = el.style.height; el.classList.remove("dragging"); el.style.height = d.ht0 + "px";
      const lb = el.querySelector(".t"); if (lb) lb.textContent = hm(d.a.startTime) + "–" + hm(d.a.endTime);
      if (!still()) el.animate([{ height: h || d.ht0 + "px" }, { height: d.ht0 + "px" }], { duration: 320, easing: EASE });
      return cleanup();
    }
    const fl = d.float!, r = el.getBoundingClientRect();
    const done = () => { fl.remove(); el.classList.remove("lifting"); };
    if (!still() && r.width) fl.animate([{ transform: fl.style.transform }, { transform: `translate(${r.left}px,${r.top}px)` }], { duration: 300, easing: EASE, fill: "forwards" }).onfinish = done; else done();
    setTimeout(done, 450); cleanup();
  };
  const fade = (fl?: HTMLElement) => { if (!fl) return; if (still()) { fl.remove(); return; } fl.animate([{ opacity: 1 }, { opacity: 0, scale: "0.92" }], { duration: 180, easing: "ease-out", fill: "forwards" }).onfinish = () => fl.remove(); setTimeout(() => fl.remove(), 300); };
  const run = async (job: () => Promise<unknown>, msg: string, undo?: () => Promise<unknown>) => {
    try { await job(); o.toast(msg, undo ? () => { undo().then(() => store.refreshActivities()).catch((e) => o.toast(apiErrorMessage(e, "Could not undo"))); } : undefined); }
    catch (e) { o.toast(apiErrorMessage(e, "Could not save the schedule")); await store.refreshActivities().catch(() => undefined); }
  };
  const drop = () => {
    const d = DR.current!, a = d.a, fl = d.float;
    const was = { date: a.date, startTime: a.startTime, endTime: a.endTime };
    const restore = () => schedulePlan(store, a, was);
    if (d.toTrash) {
      d.el.classList.remove("lifting", "dragging"); fade(fl); cleanup();
      removeActivity(store, o, a);
      return;
    }
    if (d.kind === "pool") {
      if (d.toDay) { const pf = d.slots.find((s) => s.date === d.toDay); d.day = d.toDay; d.ns = pf ? toMin(pf.start) : toMin(hm(a.startTime) || "10:00"); d.ne = Math.min(H1 * 60, d.ns + d.dur); }
      if (d.ns == null) return back();
      const slot = { date: d.day!, startTime: fromMin(d.ns), endTime: fromMin(d.ne!) };
      const c = clash(activities, a, slot.date, slot.startTime, slot.endTime);
      if (c) { o.toast("Overlaps " + c.name); return back(); }
      d.el.classList.remove("lifting"); fade(fl); cleanup();
      return run(() => schedulePlan(store, a, slot), `${a.name} · ${fwd(slot.date)} ${slot.startTime}`, () => schedulePlan(store, a, { date: null, startTime: null, endTime: null }));
    }
    if (d.toPool) {
      d.el.classList.remove("lifting"); fade(fl); cleanup();
      return run(() => schedulePlan(store, a, { date: null, startTime: null, endTime: null }), a.name + (a.branch ? " back to Branches" : " back to To schedule"), restore);
    }
    const date = d.toDay ?? a.date!, ns = d.toDay ? d.s0! : d.ns, ne = d.toDay ? d.e0! : d.ne;
    if (ns == null || ne == null) return back();
    if (date === a.date && ns === d.s0 && ne === d.e0) return back();
    const c = clash(activities, a, date, fromMin(ns), fromMin(ne));
    if (c) { o.toast(`Overlaps ${c.name} (${hm(c.startTime)}–${hm(c.endTime)})`); return back(); }
    d.el.classList.remove("lifting", "dragging"); fade(fl); cleanup();
    run(() => schedulePlan(store, a, { date, startTime: fromMin(ns), endTime: fromMin(ne) }), date !== a.date ? `Moved to ${fwd(date)} ${fd(date)}` : `${a.name} · ${fromMin(ns)}–${fromMin(ne)}`, restore);
  };
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = DR.current; if (!d || e.pointerId !== d.pid) return;
      d.lx = e.clientX; d.ly = e.clientY;
      if (!d.on) {
        const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
        if (d.touch) { if (dist > 8) { clearTimeout(d.timer); DR.current = null; } return; }
        if (dist < 5) return;
        start();
      }
      e.preventDefault(); move(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      const d = DR.current; if (!d || e.pointerId !== d.pid) return;
      clearTimeout(d.timer);
      if (!d.on) { DR.current = null; return; }
      noClick.current = true; setTimeout(() => { noClick.current = false; }, 0);
      drop();
    };
    const onCancel = () => { const d = DR.current; if (!d) return; clearTimeout(d.timer); if (d.on) back(); else DR.current = null; };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && DR.current?.on) back(); };
    const onTouch = (e: TouchEvent) => { if (DR.current?.on) e.preventDefault(); };
    const onClick = (e: MouseEvent) => { if (noClick.current) { e.stopPropagation(); e.preventDefault(); noClick.current = false; } };
    document.addEventListener("pointermove", onMove); document.addEventListener("pointerup", onUp); document.addEventListener("pointercancel", onCancel);
    document.addEventListener("keydown", onKey); document.addEventListener("touchmove", onTouch, { passive: false }); document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("keydown", onKey); document.removeEventListener("touchmove", onTouch); document.removeEventListener("click", onClick, true);
    };
  });

  /* Preferred times for the item being dragged: bands on this day, a count on other days. */
  const hoverSlots = hover != null ? (() => { const a = activities.find((x) => x.id === hover); return a ? slotsFor(a) : []; })() : [];
  const best = hoverSlots[0]?.count ?? 0, eligible = Math.max(1, store.people.length);
  const poolItem = (a: ActivityResponse, kind: "idea" | "branch") => {
    const s = slotsFor(a)[0], dragOk = canDrag(a);
    return <button key={a.id} type="button" data-pool-item={a.id} className={"pool-item" + (kind === "branch" ? " alt-item" : "")}
      onPointerDown={dragOk ? (e) => begin(e, a, "pool", "move") : undefined}
      onClick={() => peek.idea(a.id)}>
      {kind === "idea" ? <span className={"cat-" + catKey(a.category)} style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 12, flex: "none" }}><Icon n={catIcon(a.category)} s={17} /></span>
        : <span className="alt-ico"><Icon n="branch" s={17} /></span>}
      <span style={{ flex: 1, minWidth: 0 }}><strong>{a.name}</strong><small className="num">{s ? <><Icon n="clock" s={12} /> {fwd(s.date)} {fd(s.date)} · {s.start} · {s.count}/{eligible}</> : a.category}</small></span>
      <Icon n="cal" s={17} className="pool-go" />
    </button>;
  };
  const dayExp = expenses.filter((e) => e.date === day);
  return <div className="view-split">
    {dragging && <div className="trash-drop" data-trash aria-hidden="true"><Icon n="trash" s={20} /><span>Delete</span></div>}
    <div className="col">
      <div className="sec-head"><h1>Schedule</h1><span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Seg name="schedMode" value={mode} onChange={setMode} options={[["grid", <><Icon n="clock" s={15} /> Timeline</>], ["cal", <><Icon n="cal" s={15} /> Calendar</>]]} />
        <button type="button" className="btn btn-outline" data-tour="export" onClick={() => o.dialog(<ExportDialog />)}><Icon n="download" s={17} />Export</button></span></div>
      {mode === "cal" ? <MonthCal day={day} onPick={setDay} /> : <>
        <div className="days" role="group" aria-label="Days" ref={daysBox}>{days.map((d) => {
          const n = dayActs(activities, d).length, pip = hoverSlots.filter((s) => s.date === d && d !== day).reduce((m, s) => Math.max(m, s.count), 0);
          return <button key={d} type="button" data-v={d} aria-pressed={d === day} onClick={() => setDay(d)}>
            <span style={{ fontSize: 12 }}>{d === today() ? "Today" : fwd(d)}</span><b className="num">{pd(d).getDate()}</b><span className="dots">{Array.from({ length: Math.min(n, 4) }, (_, i) => <i key={i} />)}</span>
            {pip > 0 && <i className="pref-pip num">{pip}</i>}</button>;
        })}</div>
        <section className="card pad"><div className="sec-head" style={{ marginBottom: 10 }}><h3>{fwd(day)} {fdy(day)}</h3><span className="figs"><span title="Plans this day"><Icon n="cal" s={14} />{acts.length}</span></span></div>
          <Timeline day={day} pxh={64} height={620} tlRef={tl} gridRef={grid} onOpen={(a) => peek.plan(a.id)} drag={canDrag} onDragStart={(e, a, m) => begin(e, a, "ev", m)}>
            {hoverSlots.filter((s) => s.date === day).map((s, i) => <div key={i} className={"pref-band" + (s.count === best ? " best" : "")} style={{ top: (toMin(s.start) / 60 - H0) * 64, height: Math.max(26, (toMin(s.end) - toMin(s.start)) / 60 * 64 - 4) }}>
              <span className="pref-tag"><b className="num">{s.start} · {s.count}/{eligible}</b></span></div>)}
          </Timeline></section>
      </>}
    </div>
    <div className="col">
      {mode === "cal" ? <Agenda day={day} onTimeline={() => setMode("grid")} /> : <>
        <section className="card pad pool-card" data-pool-drop="ideas"><div className="sec-head"><h3>To schedule<span className="n num">{pool.length}</span></h3></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {pool.length ? pool.map((a) => poolItem(a, "idea")) : <Empty icon="check" text="Everything approved is scheduled" />}
            {voting > 0 && <button type="button" className="add-wide" onClick={() => nav(`/trip/${t.tripId}/vote`)}><Icon n="vote" s={17} />{voting} still voting</button>}
          </div></section>
        <section className="card pad pool-card alt-pool" data-pool-drop="branches"><div className="sec-head"><h3><Icon n="branch" s={17} /> Branches<span className="n num">{branches.length}</span></h3>
          {can && <button type="button" className="icon-btn sm" aria-label="New branch" data-tour="new-branch" onClick={() => o.dialog(<BranchDialog />, { wide: true })}><Icon n="plus" s={17} /></button>}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {branches.map((a) => poolItem(a, "branch"))}
            {!branches.length && (can ? <button type="button" className="pool-empty" aria-label="Add a branch" onClick={() => o.dialog(<BranchDialog />, { wide: true })}><Icon n="plus" s={18} /></button>
              : <div className="pool-empty"><Icon n="branch" s={18} /></div>)}
          </div></section>
        <section className="card pad"><h3>Day budget</h3><div style={{ marginTop: 6 }}>
          {exp.error && !exp.data ? <LoadError compact text={exp.error} onRetry={exp.retry} /> : dayExp.length ? <>{dayExp.map((e) => <div key={e.expenseId} className="list-row" role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={() => nav(`/trip/${t.tripId}/expenses`, { state: { expense: e.expenseId } })}>
            <span className="cat-dot" style={{ background: "var(--primary)" }} /><span style={{ flex: 1, fontWeight: 600 }}>{e.description}</span><b className="num">{money(e.amount, t.baseCurrency)}</b></div>)}
            <div className="kv"><span>Total</span><span className="num">{money(sum(dayExp.map((e) => e.amount)), t.baseCurrency)}</span></div></> : <Empty icon="receipt" text="No spending this day" />}
        </div></section>
      </>}
    </div>
  </div>;
}

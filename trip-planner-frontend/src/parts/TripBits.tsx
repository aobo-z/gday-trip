import { useState, type PointerEvent as RPointerEvent, type ReactNode, type Ref } from "react";
import type { ActivityResponse } from "../api/activityApi";
import { updateVotingThreshold } from "../api/tripApi";
import { apiErrorMessage } from "../api/apiError";
import { useApp, useMe, useTrip } from "../lib/stores";
import { H0, H1, dayActs } from "../lib/timeline";
import { useVote } from "./useVote";
import { useOverlay } from "../ui/overlayContext";
import { Chip, Empty, Icon, Stack } from "../ui/kit";
import { useSlide } from "../ui/slide";
import { catIcon, catKey, chipOf, editable, ideaKind, isOwner, isScheduled, overlaps } from "../lib/domain";
import { MON, fromMin, hm, iso, pd, toMin, today, nowTime, fdy } from "../lib/format";

/* ---------- Votes ---------- */
export function Prog({ a }: { a: ActivityResponse }) {
  const n = Math.max(1, a.eligibleMemberCount), cells: ReactNode[] = [];
  for (let i = 0; i < n; i++) cells.push(<i key={i} className={i < a.approveCount ? "on" : i >= n - a.rejectCount ? "no" : ""} />);
  return <span className="prog" style={{ "--n": n, width: Math.min(120, n * 22) } as React.CSSProperties} title={`${a.approveCount} of ${a.requiredApprovals} needed · ${a.rejectCount} against`}>{cells}</span>;
}
/** Approvals against the number needed; once enough have approved, a tick and the count instead of "4/3". */
export function Tally({ a }: { a: ActivityResponse }) {
  const met = a.approveCount >= a.requiredApprovals;
  return <b className={"num tally" + (met ? " met" : "")} title={`${a.approveCount} approved · ${a.requiredApprovals} needed`}>{met ? <><Icon n="check" s={13} />{a.approveCount}</> : `${a.approveCount}/${a.requiredApprovals}`}</b>;
}
/** Scheduled plans hide the buttons, so a late reject can't push an arranged plan back to "not approved". */
export function VoteCell({ a }: { a: ActivityResponse }) {
  const { trip } = useTrip(), vote = useVote(), dis = !editable(trip);
  return <>
    <button type="button" className="vote up" aria-pressed={a.currentUserVote === "APPROVE"} aria-label="Approve" disabled={dis} onClick={(e) => { e.stopPropagation(); vote(a, "APPROVE"); }}><Icon n="vote" s={18} /></button>
    <button type="button" className="vote down" aria-pressed={a.currentUserVote === "REJECT"} aria-label="Reject" disabled={dis} onClick={(e) => { e.stopPropagation(); vote(a, "REJECT"); }}><Icon n="down" s={18} /></button>
  </>;
}
export function IdeasTable({ list, onOpen }: { list: ActivityResponse[]; onOpen: (a: ActivityResponse) => void }) {
  const { name } = useTrip();
  return <div className="table-box"><table><thead><tr><th>Place</th><th>By</th><th>Votes</th><th>Status</th><th style={{ textAlign: "right" }}><span className="sr">Vote</span></th></tr></thead><tbody>
    {list.map((a) => { const k = ideaKind(a); return <tr key={a.id} className="click" tabIndex={0} onClick={() => onOpen(a)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(a); }}>
      <td><span className="place"><span className={"ev-ico cat-" + catKey(a.category)} style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 11 }}><Icon n={catIcon(a.category)} s={17} /></span>
        <span>{a.name}<small className="muted" style={{ display: "block", fontWeight: 500, fontSize: 12 }}>{a.location || a.category}</small></span></span></td>
      <td><Stack people={[{ id: a.createdById, name: a.createdByUsername || name(a.createdById) }]} max={1} /></td>
      <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Prog a={a} /><Tally a={a} /></span></td>
      <td><Chip text={chipOf(a)[0]} cls={chipOf(a)[1]} icon={chipOf(a)[2]} /></td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{k !== "scheduled" && k !== "branch" && <VoteCell a={a} />}</td>
    </tr>; })}
  </tbody></table></div>;
}

/* ---------- Approval threshold (PUT /trips/{id}/voting-threshold, owner only, 0 < x ≤ 1, two decimals).
   One figure per traveller: tap how many must approve. Stored as k / n rounded down to two decimals,
   which the backend's max(1, ceil(threshold × members)) turns back into exactly k. ---------- */
const thrValue = (k: number, n: number) => Math.floor(k / n * 100) / 100;
const needAt = (thr: number, n: number) => Math.max(1, Math.ceil(thr * n - 1e-9));
function impactAt(list: ActivityResponse[], thr: number) {
  const c = { ok: 0, open: 0, no: 0 };
  list.forEach((a) => {
    if (a.branch) return;
    const need = needAt(thr, a.eligibleMemberCount);
    if (a.approveCount >= need) c.ok++; else if (a.approveCount + a.remainingEligibleVotes < need) c.no++; else c.open++;
  });
  return c;
}
export function Threshold({ wide }: { wide?: boolean }) {
  const store = useTrip(), o = useOverlay(), app = useApp();
  const { trip, activities, people } = store, n = Math.max(1, people.length), can = isOwner(trip) && editable(trip);
  const cur = needAt(trip.votingThreshold, n);
  const [hover, setHover] = useState<number | null>(null);
  const k = hover ?? cur, v = hover ? thrValue(hover, n) : trip.votingThreshold, c = impactAt(activities, v);
  const save = async (next: number) => {
    const val = thrValue(next, n), old = trip.votingThreshold; if (Math.abs(val - old) < 0.001) return;
    const before = impactAt(activities, old).ok;
    try {
      const t = await updateVotingThreshold(trip.tripId, val); store.setTrip(t); app.putTrip(t); await store.refreshActivities();
      const moved = impactAt(activities, val).ok - before;
      o.toast(`Needs ${next} of ${n}` + (moved ? ` · ${moved > 0 ? "+" : ""}${moved} approved` : ""), async () => { const r = await updateVotingThreshold(trip.tripId, old); store.setTrip(r); app.putTrip(r); store.refreshActivities(); });
    } catch (e) { o.toast(apiErrorMessage(e, "Threshold not saved")); }
  };
  const dots: ReactNode[] = [];
  for (let i = 1; i <= n; i++) dots.push(<button key={i} type="button" className={"thr-dot" + (i <= k ? " on" : "")} aria-pressed={i === cur} aria-label={`Needs ${i} of ${n}`} disabled={!can}
    onPointerEnter={() => can && setHover(i)} onFocus={() => can && setHover(i)} onBlur={() => setHover(null)} onClick={() => save(i)}><Icon n="user" s={wide ? 17 : 15} /></button>);
  return <div className={"thr" + (wide ? " wide" : "")}>
    <span className="thr-label" title="How many travellers must approve an activity"><Icon n="vote" s={16} />Approval</span>
    <span className="thr-dots" role="group" aria-label="Approvals needed" onPointerLeave={() => setHover(null)}>{dots}</span>
    <span className="thr-need"><b className="num">{k} of {n}</b><span className="hint num">{Math.round(v * 100)}%</span></span>
    <span className="thr-impact"><Chip text={c.ok} cls="c-good" icon="check" title="Approved" /><Chip text={c.open} cls="c-plain" icon="clock" title="Still open" /><Chip text={c.no} cls="c-bad" icon="x" title="Rejected" /></span>
  </div>;
}

/* ---------- Month calendar for the trip ---------- */
export function MiniCal({ day, onPick }: { day: string; onPick: (d: string) => void }) {
  const { trip, activities } = useTrip();
  const [month, setMonth] = useState(day.slice(0, 7));
  const first = pd(month + "-01"), start = new Date(first); start.setDate(1 - first.getDay());
  const has = new Set(activities.filter(isScheduled).map((a) => a.date));
  const box = useSlide("cal", [day, month]);
  const cells: ReactNode[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i); const s = iso(d);
    if (i >= 35 && d.getMonth() !== first.getMonth()) break;
    const inR = s >= trip.startDate && s <= trip.endDate, cls = ["day"];
    if (inR) cls.push("in"); if (s === trip.startDate || (inR && d.getDay() === 0)) cls.push("first"); if (s === trip.endDate || (inR && d.getDay() === 6)) cls.push("last");
    if (d.getMonth() !== first.getMonth()) cls.push("other"); if (s === today()) cls.push("today"); if (has.has(s)) cls.push("has");
    cells.push(<div key={s} className={cls.join(" ")}><button type="button" aria-pressed={s === day} disabled={!inR} aria-label={fdy(s)} onClick={() => onPick(s)}>{d.getDate()}</button></div>);
  }
  const multi = trip.startDate.slice(0, 7) !== trip.endDate.slice(0, 7);
  return <>
    <div className="sec-head"><h3>{MON[first.getMonth()]} {first.getFullYear()}</h3>
      {multi && <span style={{ display: "flex", gap: 4 }}><button type="button" className="icon-btn sm" aria-label="Previous month" onClick={() => setMonth(trip.startDate.slice(0, 7))}><Icon n="left" /></button><button type="button" className="icon-btn sm" aria-label="Next month" onClick={() => setMonth(trip.endDate.slice(0, 7))}><Icon n="right" /></button></span>}</div>
    <div className="cal" style={{ marginTop: 8 }} ref={box}>{["S", "M", "T", "W", "T", "F", "S"].map((w, i) => <div key={i} className="wd">{w}</div>)}{cells}</div>
  </>;
}

/* ---------- Day timeline ---------- */
export function Timeline({ day, pxh = 60, height = 440, onOpen, drag, onDragStart, gridRef, tlRef, people = true, children }: {
  day: string; pxh?: number; height?: number; onOpen: (a: ActivityResponse) => void;
  drag?: (a: ActivityResponse) => boolean; onDragStart?: (e: RPointerEvent<HTMLElement>, a: ActivityResponse, mode: "move" | "resize") => void;
  gridRef?: Ref<HTMLDivElement>; tlRef?: Ref<HTMLDivElement>; people?: boolean; children?: ReactNode;
}) {
  const { activities, name } = useTrip(), me = useMe().userId;
  const acts = dayActs(activities, day);
  /* Where plans overlap, the one I'm going to stands out and the ones I'm skipping fade, branches included. */
  const going = (a: ActivityResponse) => a.memberIds.includes(me);
  const pick = (a: ActivityResponse) => !acts.some((x) => x.id !== a.id && overlaps(a, x)) ? "" : going(a) ? " mine" : acts.some((x) => x.id !== a.id && overlaps(a, x) && going(x)) ? " skip" : "";
  /* Column layout per overlap cluster, so one branch only narrows the events it overlaps. Group plans take column 0. */
  const place: Record<number, [number, number]> = {}, clusters: ActivityResponse[][] = [];
  let end = -1;
  acts.forEach((a) => { const s = toMin(a.startTime!); if (s >= end) clusters.push([]); clusters[clusters.length - 1].push(a); end = Math.max(end, toMin(a.endTime ?? fromMin(s + 60))); });
  clusters.forEach((g) => {
    const cols: [number, number][][] = [];
    [...g].sort((x, y) => Number(x.branch) - Number(y.branch)).forEach((a) => {
      const s = toMin(a.startTime!), e = toMin(a.endTime ?? fromMin(s + 60)); let c = 0;
      while (cols[c]?.some((x) => s < x[1] && e > x[0])) c++;
      (cols[c] = cols[c] ?? []).push([s, e]); place[a.id] = [c, 0];
    });
    g.forEach((a) => { place[a.id][1] = cols.length; });
  });
  const hours: ReactNode[] = [];
  for (let h = H0; h <= H1; h++) hours.push(<div key={h} className="hr" style={{ top: (h - H0) * pxh }}><span className="num">{String(h).padStart(2, "0")}:00</span></div>);
  const now = day === today() ? toMin(nowTime()) : null;
  return <div className="tl" data-day={day} style={{ height }} ref={tlRef}>
    <div className="tl-grid" ref={gridRef} data-pxh={pxh} style={{ height: (H1 - H0) * pxh + 20 }}>
      {hours}
      {acts.map((a) => {
        const s = toMin(a.startTime!), e = toMin(a.endTime ?? fromMin(s + 60)), top = (s / 60 - H0) * pxh, ht = Math.max(34, (e - s) / 60 * pxh - 4), [c, n] = place[a.id];
        const canDrag = !!drag?.(a);
        return <button key={a.id} type="button" data-ev={a.id} title={`${a.name} · ${hm(a.startTime)}–${hm(a.endTime)}`} className={"ev " + (a.branch ? "alt" + (acts.some((x) => !x.branch && overlaps(a, x)) ? "" : " solo") : "cat-" + catKey(a.category)) + pick(a)}
          style={{ top, height: ht, left: `calc(52px + (100% - 52px) * ${c / n})`, width: `calc((100% - 52px) / ${n} - 6px)` }}
          onClick={() => onOpen(a)} onPointerDown={canDrag ? (ev) => onDragStart?.(ev, a, "move") : undefined}>
          {ht > 44 && <span className="ico"><Icon n={a.branch ? "branch" : catIcon(a.category)} s={16} /></span>}
          <span style={{ minWidth: 0 }}><strong>{a.name}</strong><span className="t num">{hm(a.startTime)}–{hm(a.endTime)}</span>
            {people && ht > 86 && a.memberIds.length > 0 && <span style={{ display: "block", marginTop: 6 }}><Stack people={a.memberIds.map((id) => ({ id, name: name(id) }))} max={4} /></span>}</span>
          {canDrag && <span className="ev-resize" aria-hidden="true" onPointerDown={(ev) => { ev.stopPropagation(); onDragStart?.(ev, a, "resize"); }} />}
        </button>;
      })}
      {now != null && now >= H0 * 60 && now <= H1 * 60 && <div className="nowline" style={{ top: (now / 60 - H0) * pxh }}><b className="num">{nowTime()}</b><i /></div>}
      {!acts.length && <div className="tl-empty"><Icon n="cal" s={22} /><span>Free day</span></div>}
      {children}
    </div>
  </div>;
}
export function NoTrip() { return <section className="card"><Empty icon="grid" text="Create or join a trip to start planning" /></section>; }

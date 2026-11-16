import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { archiveTrip, publishTrip, startTrip, uploadTripCover } from "../api/tripApi";
import { expenseApi, type Expense } from "../api/expenseApi";
import { apiErrorMessage } from "../api/apiError";
import { useApp, useTrip } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { Avatar, Chip, CountUp, Empty, Icon, LoadError, Stack } from "../ui/kit";
import { useLoad } from "../lib/useLoad";
import { STATUS, STATUS_ORDER, activeTrips, coverOf, editable, ideaKind, isOwner, pipeline, toneOf } from "../lib/domain";
import { ago, dayDiff, fd, frange, fwd, money, r2, sum, today, unit } from "../lib/format";
import { catColor, expCategory } from "../lib/expense";
import { MiniCal, Timeline } from "../parts/TripBits";
import { scrollTimeline } from "../lib/timeline";
import Members from "../parts/Members";
import Announcements from "../parts/Announcements";
import TripFiles from "../parts/TripFiles";
import TripForm from "../parts/TripForm";
import { usePeek } from "../parts/usePeek";
import { IMAGE_ACCEPT, prepareImage } from "../lib/prepareImage";

function Hero() {
  const store = useTrip(), app = useApp(), o = useOverlay(), nav = useNavigate();
  const { trip: t, people } = store, owner = isOwner(t);
  const file = useRef<HTMLInputElement>(null);
  const lc = ({ PLANNING: ["start", "play", "Start trip"], ONGOING: ["archive", "archive", "Archive"], ARCHIVED: ["publish", "share", "Share"] } as Record<string, [string, string, string]>)[t.status];
  const list = activeTrips(app.trips), idx = list.findIndex((x) => x.tripId === t.tripId);
  const step = (d: number) => { const n = list[(idx + d + list.length) % list.length]; if (n) nav(`/trip/${n.tripId}/overview`); };
  const save = (x: typeof t) => { store.setTrip(x); app.putTrip(x); };
  const lifecycle = async () => {
    const [kind] = lc;
    const text = kind === "start" ? { title: `Start ${t.name}?`, label: "Start trip" } : kind === "archive" ? { title: `Archive ${t.name}?`, body: "Plans and expenses become read-only. Reviews open.", label: "Archive" }
      : { title: "Share to Community?", body: "Places and times only. Members, money and comments stay private.", label: "Share" };
    if (!(await o.confirm(text))) return;
    try {
      save(await (kind === "start" ? startTrip : kind === "archive" ? archiveTrip : publishTrip)(t.tripId));
      o.toast(kind === "start" ? "Trip started" : kind === "archive" ? "Archived · reviews open" : "Shared to Community");
    } catch (e) { o.toast(apiErrorMessage(e, "Could not change the trip")); }
  };
  /* Shrunk in the browser first, so a large phone photo still fits the server's 5 MB limit. */
  const upload = async (f: File) => {
    try { save(await uploadTripCover(t.tripId, await prepareImage(f))); o.toast("Cover updated"); } catch (e) { o.toast(apiErrorMessage(e, "Cover not uploaded")); }
  };
  return <section className={"hero card " + toneOf(t.tripId)}>
    <div className="hero-photo" style={{ backgroundImage: `url('${coverOf(t)}')` }} />
    <div className="hero-tools">
      {owner && (editable(t) || t.status === "ARCHIVED") && <button type="button" className="icon-btn sm" aria-label="Upload cover" onClick={() => file.current?.click()}><Icon n="image" s={17} /></button>}
      {owner && (editable(t) || t.status === "ARCHIVED") && <button type="button" className="icon-btn sm" aria-label="Edit trip" onClick={() => o.dialog(<TripForm trip={t} onSaved={(x) => store.setTrip(x)} />)}><Icon n="edit" s={17} /></button>}
      <input ref={file} type="file" accept={IMAGE_ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
    </div>
    <div className="hero-in">
      <div className="hero-head"><div className="kicker">{t.name} · {frange(t.startDate, t.endDate)}</div><div className="hero-title" title={t.destination}>{t.destination.split(",")[0]}</div></div>
      <div className="hero-foot">
        <Stack people={people} />
        <Chip text={STATUS[t.status]?.[0] ?? t.status} cls={STATUS[t.status]?.[1]} />
        {lc && owner && <button type="button" className="btn btn-solid btn-sm" onClick={lifecycle}><Icon n={lc[1]} s={15} />{lc[2]}</button>}
        <span className="step-btn">
          <button type="button" className="round solid" aria-label="Previous trip" disabled={list.length < 2} onClick={() => step(-1)}><Icon n="left" s={20} /></button>
          <button type="button" className="round solid" aria-label="Next trip" disabled={list.length < 2} onClick={() => step(1)}><Icon n="right" s={20} /></button>
        </span>
      </div>
    </div>
  </section>;
}

/** Spending by category as overlapping bubbles: area follows the amount, biggest first so smaller ones sit on top. */
function Spend({ expenses, error, onRetry }: { expenses: Expense[] | null; error: string; onRetry: () => void }) {
  const { trip: t } = useTrip();
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0), [dim, setDim] = useState<string | null>(null);
  const by: Record<string, number> = {};
  (expenses ?? []).forEach((e) => { const c = expCategory(e.category); by[c] = (by[c] ?? 0) + e.amount; });
  const data = Object.entries(by).map(([k, v]) => [k, r2(v)] as [string, number]).filter((d) => d[1] > 0).sort((a, b) => b[1] - a[1]);
  const total = sum(data.map((d) => d[1]));
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); return () => ro.disconnect();
  }, []);
  const H = 196, placed: { x: number; y: number; r: number; k: string; v: number }[] = [];
  if (w && data.length) {
    const OV = 0.8, R = Math.min(90, w / 3, H / 2 - 6), max = data[0][1];
    data.forEach(([k, v]) => {
      const r = Math.max(20, Math.round(Math.sqrt(v / max) * R)); let pos = { x: 0, y: 0 };
      if (placed.length) {
        const ws = sum(placed.map((p) => p.r * p.r)), cx = sum(placed.map((p) => p.x * p.r * p.r)) / ws, cy = sum(placed.map((p) => p.y * p.r * p.r)) / ws; let bd = 1e9;
        placed.forEach((p) => {
          for (let a = 0; a < 360; a += 8) {
            const rad = a * Math.PI / 180, dist = (p.r + r) * OV, x = p.x + Math.cos(rad) * dist, y = p.y + Math.sin(rad) * dist;
            if (!placed.every((q) => Math.hypot(q.x - x, q.y - y) >= (q.r + r) * OV - 0.5)) continue;
            const score = Math.hypot((x - cx) * 0.75, (y - cy) * 1.35);
            if (score < bd) { bd = score; pos = { x, y }; }
          }
        });
      }
      placed.push({ ...pos, r, k, v });
    });
    const x0 = Math.min(...placed.map((p) => p.x - p.r)), x1 = Math.max(...placed.map((p) => p.x + p.r)), y0 = Math.min(...placed.map((p) => p.y - p.r)), y1 = Math.max(...placed.map((p) => p.y + p.r));
    const sc = Math.min(1, (w - 4) / (x1 - x0), (H - 4) / (y1 - y0)), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    placed.forEach((p) => { p.x = w / 2 + (p.x - mx) * sc; p.y = H / 2 + (p.y - my) * sc; p.r = Math.round(p.r * sc); });
  }
  return <section className="spend">
    <div className="sec-head spend-head"><h3><Icon n="wallet" s={17} /> Spent</h3><b className="num"><CountUp value={total} k={"spent" + t.tripId} format={(v) => money(v, t.baseCurrency, { short: true })} /> <span className="muted" style={{ fontWeight: 600 }}>/ {money(t.plannedBudget, t.baseCurrency, { short: true })}</span></b></div>
    <div className="bubbles" ref={box}>
      {error && !expenses ? <LoadError text={error} onRetry={onRetry} /> : expenses && !data.length && <Empty icon="wallet" text="No expenses yet" />}
      {placed.map((p) => <span key={p.k} className={"bub num" + (dim && dim !== p.k ? " dim" : "")} tabIndex={0} data-tip={`${p.k} · ${money(p.v, t.baseCurrency)}`}
        style={{ left: p.x - p.r, top: p.y - p.r, width: 2 * p.r, height: 2 * p.r, background: catColor(p.k), fontSize: p.r > 40 ? 18 : 13 }}>{p.r >= 26 ? Math.round(p.v / total * 100) + "%" : ""}</span>)}
    </div>
    <div className="legend" onMouseLeave={() => setDim(null)}>{data.map(([k]) => <span key={k} style={{ color: catColor(k) }} onMouseEnter={() => setDim(k)}><i /><span style={{ color: "var(--ink-2)" }}>{k}</span></span>)}</div>
  </section>;
}

/* Lifecycle steps; the labels are short so all four fit under the card. */
const STEP_LABEL: Record<string, string> = { PLANNING: "Planning", ONGOING: "Ongoing", ARCHIVED: "Archived", PUBLISHED: "Shared" };
const STEP_HINT: Record<string, string> = { PLANNING: "Activities, votes and the schedule are being worked out", ONGOING: "The trip has started", ARCHIVED: "Finished; plans are read-only and reviews are open", PUBLISHED: "Shared to Community" };
const PIPE: [keyof ReturnType<typeof pipeline>, string, string, string][] = [
  ["scheduled", "Scheduled", "var(--primary)", "on the calendar"],
  ["approved", "To schedule", "var(--good)", "approved, waiting for a time"],
  ["voting", "Voting", "var(--warn)", "still collecting votes"],
  ["rejected", "Rejected", "color-mix(in srgb, var(--muted) 45%, var(--card))", "not approved"],
];
function Stats({ expenses, failed }: { expenses: Expense[] | null; failed: boolean }) {
  const { trip: t, activities } = useTrip(), nav = useNavigate();
  const days = dayDiff(t.startDate, t.endDate) + 1, spent = sum((expenses ?? []).map((e) => e.amount)), pct = Math.round(spent / (t.plannedBudget || 1) * 100);
  const dayNo = t.status === "ONGOING" ? dayDiff(t.startDate, today()) + 1 : null, at = STATUS_ORDER.indexOf(t.status);
  const ideas = activities, p = pipeline(ideas), all = ideas.length;
  const need = editable(t) ? ideas.filter((a) => ideaKind(a) === "needs").length : 0;
  return <div className="stats">
    <section className="stat card"><div className="stat-label">Trip length<Icon n="cal" s={18} /></div>
      <div className="stat-value num"><CountUp value={days} k="days" /> <small>{unit(days, "day")}{dayNo && dayNo > 0 && dayNo <= days ? " · day " + dayNo : ""}</small></div>
      <ol className="steps-line" aria-label="Trip stage">{STATUS_ORDER.map((s, i) => <li key={s} className={i < at ? "done" : i === at ? "cur" : ""} aria-current={i === at ? "step" : undefined} title={STEP_HINT[s]}>
        <i>{i < at && <Icon n="check" s={10} />}</i><span>{STEP_LABEL[s]}</span></li>)}</ol>
      <div className="stat-foot" style={{ minHeight: 0 }}><span className="range"><Icon n="cal" s={16} />{frange(t.startDate, t.endDate)}</span></div></section>
    <section className="stat card"><div className="stat-label">Trip budget<Icon n="wallet" s={18} /></div>
      <div className="stat-value num">{failed && !expenses ? "—" : <><CountUp value={pct} k="budget-pct" /><small>%</small></>}</div>
      <div className="bar"><i style={{ width: Math.min(100, pct) + "%", ...(pct >= 100 ? { background: "var(--bad)" } : pct >= 80 ? { background: "var(--warn)" } : {}) }} /></div>
      <div className="stat-foot"><span className="num">{money(spent, t.baseCurrency, { short: true })} <span className="muted">/ {money(t.plannedBudget, t.baseCurrency, { short: true })}</span></span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => nav(`/trip/${t.tripId}/expenses`)}><Icon n="arrow" s={14} /><span className="sr">Expenses</span></button></div></section>
    <section className="stat card"><div className="stat-label">Activities{need > 0
      ? <button type="button" className="btn btn-sm pipe-need" aria-label={`${need} need your vote`} onClick={() => nav(`/trip/${t.tripId}/vote`, { state: { filter: "needs" } })}><Icon n="vote" s={14} /><span>{need}<span className="pipe-need-long"> need your vote</span><span className="pipe-need-short"> to vote</span></span><Icon n="arrow" s={14} /></button>
      : <Icon n="bulb" s={18} />}</div>
      <div className="stat-value num" title="Scheduled activities out of all approved activities"><CountUp value={p.scheduled} k={"planned" + t.tripId} /> <small>/ {p.scheduled + p.approved} scheduled</small></div>
      <div className="pipe" role="img" aria-label={PIPE.map((x) => `${p[x[0]]} ${x[1].toLowerCase()}`).join(", ")}>
        {PIPE.map((x) => p[x[0]] ? <i key={x[0]} style={{ flex: p[x[0]], background: x[2] }} title={`${x[1]} · ${p[x[0]]} — ${x[3]}`} /> : null)}{!all && <i />}</div>
      <div className="pipe-key">{PIPE.map((x) => <span key={x[0]} title={x[3]}><b className="num"><i style={{ background: x[2] }} />{p[x[0]]}</b><small>{x[1]}</small></span>)}</div>
    </section>
  </div>;
}

/* The trip's shared workspace: owners' announcements (FR-19) and everyone's files (FR-18). */
function Workspaces() {
  return <div className="ws-row"><Announcements /><TripFiles /></div>;
}

const UPD: Record<string, [string, string]> = { PROPOSAL_CREATED: ["plus", "proposed"], ACTIVITY_SCHEDULED: ["cal", "scheduled"], ACTIVITY_DELETED: ["trash", "removed"],
  BRANCH_CREATED: ["branch", "branched"], BRANCH_SCHEDULED: ["cal", "scheduled"], BRANCH_REMOVED: ["vote", "sent back to voting"] };
function Updates() {
  const store = useTrip(), { updates } = store, peek = usePeek();
  return <section className="card pad hist-card"><div className="sec-head"><h3><Icon n="clock" s={17} /> History{updates && <span className="n num">{updates.length}</span>}</h3></div><div className="act-list">
    {!updates ? <LoadError compact text="Couldn't load the history." onRetry={() => { store.reload().catch(() => undefined); }} /> : updates.length ? updates.map((u) => <div key={u.logId} className="list-row">
      <Avatar id={u.changedById} name={u.changedByUsername} onClick={() => peek.person(u.changedById, u.changedByUsername)} />
      <span style={{ flex: 1, fontSize: 14 }}><b>{u.changedByUsername}</b> <span className="muted">{UPD[u.changeType]?.[1] ?? ""}</span> {u.description.replace(/^[^#]*#\d+:\s*/, "")}</span>
      <span className="hint num">{ago(u.changedAt)}</span></div>) : <Empty icon="bell" text="Nothing yet" />}
  </div></section>;
}

export default function Overview() {
  const { trip: t } = useTrip(), peek = usePeek();
  const exp = useLoad(() => expenseApi.list(t.tripId), [t.tripId], "Couldn't load the expenses."), expenses = exp.data ?? null;
  const inTrip = today() >= t.startDate && today() <= t.endDate;
  const [day, setDay] = useState(inTrip ? today() : t.startDate);
  const tl = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollTimeline(tl.current); }, [day]);
  return <div className="view-split ov-split">
    <div className="col">
      <div className="hero-row"><Hero /><Spend expenses={expenses} error={exp.error} onRetry={exp.retry} /></div>
      <Stats expenses={expenses} failed={!!exp.error} />
      <Members />
      <Workspaces />
    </div>
    <div className="col">
      <section className="card pad"><MiniCal day={day} onPick={setDay} />
        <div className="sec-head" style={{ margin: "14px 0 6px" }}><h3><Icon n="cal" s={17} /> {fwd(day)} {fd(day)}</h3></div>
        <Timeline day={day} pxh={50} height={320} tlRef={tl} people={false} onOpen={(a) => peek.plan(a.id)} /></section>
      <Updates />
    </div>
  </div>;
}

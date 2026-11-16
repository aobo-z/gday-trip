import { useEffect, useState, type FormEvent } from "react";
import { fetchActivityPreferences, type ActivityPreferencesResponse, type ActivityResponse } from "../api/activityApi";
import { createBranchPlan } from "../api/branchPlanningApi";
import { apiErrorMessage } from "../api/apiError";
import { useTrip } from "../lib/stores";
import { useImage } from "../lib/images";
import { useOverlay } from "../ui/overlayContext";
import { DlgHead } from "../ui/Overlay";
import { Avatar, Chip, FieldErr, Icon } from "../ui/kit";
import { canBranch, catIcon, clash, ideaKind, IDEA_CHIP, isOwner, toneOf } from "../lib/domain";
import { daysBetween, fwd, hm, pd, today } from "../lib/format";
import { schedulePlan } from "../lib/actions";
import { SlotPicker } from "./SlotPicker";
import { usePeek } from "./usePeek";
import IdeaForm from "./IdeaForm";

/** Member chips; the list of who attends can only be set by an owner (the backend checks this too). */
export function Who({ ids, onChange }: { ids: number[]; onChange: (ids: number[]) => void }) {
  const { people } = useTrip();
  return <div className="who">{people.map((p) => <label key={p.id}><input type="checkbox" checked={ids.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id))} />
    <span><Avatar id={p.id} name={p.name} />{p.name}</span></label>)}</div>;
}

export function ScheduleDialog({ a }: { a: ActivityResponse }) {
  const store = useTrip(), o = useOverlay(), peek = usePeek(), { trip } = store, owner = isOwner(trip);
  const [prefs, setPrefs] = useState<ActivityPreferencesResponse | null>(null);
  const inTrip = today() >= trip.startDate && today() <= trip.endDate;
  const [v, setV] = useState({ date: a.date ?? (inTrip ? today() : trip.startDate), start: hm(a.startTime) || "10:00", end: hm(a.endTime) || "12:00" });
  const [ids, setIds] = useState<number[]>(a.memberIds.length ? a.memberIds : store.people.map((p) => p.id));
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { fetchActivityPreferences(a.id).then(setPrefs).catch(() => undefined); }, [a.id]);
  const slots = (prefs?.slots ?? []).filter((s) => s.preferredStartTime).slice(0, 3);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (v.end <= v.start) return setErr("End time must be after start");
    if (owner && !ids.length && !a.branch) return setErr("Pick at least one person");
    const c = clash(store.activities, a, v.date, v.start, v.end);
    if (c) return setErr(`Overlaps ${c.name} (${hm(c.startTime)}–${hm(c.endTime)}).`);
    setBusy(true);
    try {
      await schedulePlan(store, a, { date: v.date, startTime: v.start, endTime: v.end, ...(owner ? { memberIds: ids } : {}) });
      o.closeDialog(); o.toast(`${a.name} · ${fwd(v.date)} ${v.start}`); peek.plan(a.id);
    } catch (ex) { setErr(apiErrorMessage(ex, "Could not schedule")); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} noValidate>
    <DlgHead title={a.name} onClose={o.closeDialog} />
    {slots.length > 0 && <div className="pills">{slots.map((s, i) => <button key={i} type="button" className="chip c-blue" style={{ height: 34, border: 0 }} title={`${s.memberCount} prefer this`}
      onClick={() => setV({ date: s.preferredDate, start: hm(s.preferredStartTime), end: hm(s.preferredEndTime) || v.end })}><Icon n="clock" s={13} />{fwd(s.preferredDate)} {pd(s.preferredDate).getDate()} · {hm(s.preferredStartTime)} · {s.memberCount}</button>)}</div>}
    <SlotPicker days={daysBetween(trip.startDate, trip.endDate)} value={v} onChange={(x) => setV({ ...v, ...x })} />
    {owner && !a.branch && <div className="field">Who's going<Who ids={ids} onChange={setIds} /></div>}
    <FieldErr msg={err} />
    <div className="dlg-foot"><button type="button" className="btn btn-ghost" onClick={o.closeDialog}>Cancel</button><button className="btn btn-primary" disabled={busy}><Icon n="cal" s={16} />Schedule</button></div>
  </form>;
}

/** One activity that could become the branch: its photo, state and votes. */
function SourceCard({ a, on, onPick }: { a: ActivityResponse; on: boolean; onPick: () => void }) {
  const url = useImage(a.imageUrls[0]), k = ideaKind(a);
  return <button type="button" className="src-card" aria-pressed={on} onClick={onPick} title={a.name}>
    <span className={"src-img " + (url ? "" : toneOf(a.id))} style={url ? { backgroundImage: `url('${url}')` } : undefined}>{!url && <Icon n={catIcon(a.category)} s={22} />}
      {on && <span className="src-tick"><Icon n="check" s={13} /></span>}</span>
    <span className="src-txt"><b className="clamp2">{a.name}</b>
      <span className="src-meta"><Chip text={IDEA_CHIP[k][0]} cls={IDEA_CHIP[k][1]} /></span></span>
  </button>;
}

/**
 * A branch (BranchActivityRequest): a pending or rejected activity taken out of voting as it is, so only those who
 * want to go need to. It waits in Branches until someone drags it onto the day; the timeline sets its time. A new
 * place goes through the activity form first, like any other activity. Opened from a plan (`at`), it goes straight onto
 * that plan's time instead, so it shows up under Same time.
 */
export function BranchDialog({ at }: { at?: ActivityResponse } = {}) {
  const store = useTrip(), o = useOverlay(), { trip } = store;
  const sources = store.activities.filter((x) => canBranch(trip, x))
    .sort((x, y) => Number(ideaKind(x) === "rejected") - Number(ideaKind(y) === "rejected") || (x.createdAt < y.createdAt ? 1 : -1));
  const [src, setSrc] = useState<number | null>(null), [q, setQ] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const source = src != null ? store.activities.find((x) => x.id === src) : undefined;
  const query = q.trim().toLowerCase();
  const shown = sources.filter((x) => !query || [x.name, x.location, x.category].join(" ").toLowerCase().includes(query));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!source) { o.dialog(<IdeaForm branchAt={at} />, { wide: true }); return; }
    setErr(""); setBusy(true);
    try {
      await createBranchPlan(trip.tripId, { sourceActivityId: source.id, name: source.name, location: source.location, category: source.category, description: source.description,
        date: at?.date ?? null, startTime: at?.startTime ?? null, endTime: at?.endTime ?? null });
      await store.refreshActivities(); o.closeDialog(); o.toast(source.name + (at ? " added at the same time as " + at.name : " added to Branches"));
    } catch (ex) { setErr(apiErrorMessage(ex, "Could not add the branch")); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} noValidate>
    <DlgHead title={<><Icon n="branch" s={20} /> New branch</>} onClose={o.closeDialog} />
    <div className="field"><span className="src-head">From an activity<span className="n num">{sources.length}</span>
      {sources.length > 6 && <label className="search src-filter"><Icon n="search" s={15} /><span className="sr">Filter activities</span><input type="search" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} /></label>}</span>
      <div className="src-grid" role="group" aria-label="Start from">
        <button type="button" className="src-card src-new" aria-pressed={src == null} onClick={() => setSrc(null)}>
          <span className="src-img"><Icon n="plus" s={22} />{src == null && <span className="src-tick"><Icon n="check" s={13} /></span>}</span>
          <span className="src-txt"><b>New place</b></span></button>
        {shown.map((x) => <SourceCard key={x.id} a={x} on={src === x.id} onPick={() => setSrc(x.id)} />)}
      </div></div>
    <FieldErr msg={err} />
    <div className="dlg-foot"><button type="button" className="btn btn-ghost" onClick={o.closeDialog}>Cancel</button>
      {source ? <button className="btn btn-primary" disabled={busy}><Icon n="branch" s={16} />Add branch</button>
        : <button className="btn btn-primary"><Icon n="plus" s={16} />Create activity</button>}</div>
  </form>;
}

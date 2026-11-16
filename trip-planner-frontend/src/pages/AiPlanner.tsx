import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCoverOptions, fetchCoverPhoto, generatePlan, savePlan, type AiPlanDraft, type PlannerPace } from "../api/aiPlannerApi";
import { uploadTripCover } from "../api/tripApi";
import { apiErrorMessage } from "../api/apiError";
import { useApp } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { DlgHead } from "../ui/Overlay";
import { Chip, FieldErr, FxCanvas, Icon, Seg, Spinner } from "../ui/kit";
import { catIcon, catKey, coverOf } from "../lib/domain";
import { CURRENCIES, addDays, cents, fd, frange, fwd, hm, money, plural, sum, today } from "../lib/format";
import { catColor } from "../lib/expense";

const INTERESTS: [string, string][] = [["Food", "utensils"], ["Culture", "landmark"], ["Nature", "mountain"], ["History", "archive"], ["Art", "image"], ["Markets", "bag"], ["Hiking", "mountain"], ["Beaches", "sun"], ["Nightlife", "moon"], ["Shopping", "bag"], ["Photography", "camera"], ["Family", "users"]];
const STEPS = ["Reading your brief", "Finding places", "Building days", "Checking budget", "Picking covers"];
const SAVE_STEPS = ["Creating the trip", "Pinning each place", "Adding the cover", "Opening the vote"];
interface Brief { destination: string; startDate: string; days: number; travellers: number; budget: string; currency: string; interests: string[]; pace: PlannerPace; notes: string }
interface CoverPhoto { name: string; landmark: string; url: string }
type Cover = { kind: "library" } | ({ kind: "google" } & CoverPhoto);

/** The chosen cover large (tap to see it full size), the choices underneath: one photo per landmark, the built-in picture last. */
function CoverPicker({ plan, covers, cover, onPick }: { plan: AiPlanDraft; covers: CoverPhoto[] | null; cover: Cover; onPick: (c: Cover) => void }) {
  const o = useOverlay();
  const library = coverOf({ destination: plan.destination, tripId: plan.tripName.length });
  if (covers == null) return <div className="field">Cover
    <div className="ai-cover-hero loading sk-block" aria-label="Finding landmark photos"><Spinner /></div>
    <div className="ai-cover-strip">{[0, 1, 2].map((i) => <span key={i} className="ai-cover-thumb sk-block" />)}</div>
  </div>;
  const url = cover.kind === "google" ? cover.url : library, label = cover.kind === "google" ? cover.landmark : "Built-in picture";
  const zoom = () => o.dialog(<div className="dlg-body"><DlgHead title={label} onClose={o.closeDialog} /><img className="ai-cover-full" src={url} alt={label} /></div>, { wide: true });
  return <div className="field">Cover
    <button type="button" className="ai-cover-hero" style={{ backgroundImage: `url('${url}')` }} onClick={zoom} aria-label={"Enlarge cover: " + label}>
      <span className="ai-cover-label"><Icon n={cover.kind === "google" ? "pin" : "image"} s={13} />{label}</span><span className="ai-cover-zoom"><Icon n="search" s={15} /></span></button>
    <div className="ai-cover-strip">
      {covers.map((c) => <button key={c.name} type="button" className="ai-cover-thumb" aria-pressed={cover.kind === "google" && cover.name === c.name} title={c.landmark} aria-label={c.landmark}
        style={{ backgroundImage: `url('${c.url}')` }} onClick={() => onPick({ kind: "google", ...c })} />)}
      <button type="button" className="ai-cover-thumb" aria-pressed={cover.kind === "library"} title="Built-in picture" aria-label="Built-in picture" style={{ backgroundImage: `url('${library}')` }} onClick={() => onPick({ kind: "library" })} />
    </div>
  </div>;
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return <div className="field">{label}<div style={{ display: "flex", alignItems: "center", gap: 6, height: 44, padding: "0 4px", borderRadius: 12, background: "var(--field)" }}>
    <button type="button" className="icon-btn sm" aria-label={"Fewer " + label} disabled={value <= min} onClick={() => onChange(value - 1)}><Icon n="minus" s={16} /></button>
    <b className="num" style={{ flex: 1, textAlign: "center" }}>{value}</b>
    <button type="button" className="icon-btn sm" aria-label={"More " + label} disabled={value >= max} onClick={() => onChange(value + 1)}><Icon n="plus" s={16} /></button></div></div>;
}

/** Progress for a slow request: steps tick forward every `pace` ms and the last one waits for the answer. */
function Working({ title, sub, steps, pace, onCancel }: { title: string; sub: string; steps: string[]; pace: number; onCancel?: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setStep((s) => Math.min(steps.length - 1, s + 1)), pace); return () => clearInterval(id); }, [pace, steps.length]);
  return <section className="card fx-card ai-work"><FxCanvas card /><div className="fx-in" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}><span className="ai-orb"><Icon n="sparkle" s={24} /></span><span><h3>{title}</h3><span className="hint num">{sub}</span></span></div>
    <ol className="steps">{steps.map((s, i) => <li key={s} className={i < step ? "done" : i === step ? "cur" : ""}><i>{i < step && <Icon n="check" s={14} />}</i><span className={i === step ? "shiny" : undefined}>{s}</span></li>)}</ol>
    {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}</div></section>;
}

/** Brief → AI draft (POST /ai-planner/draft, can take up to a minute) → edit → save as a new trip (POST /ai-planner/trips). */
export default function AiPlanner() {
  const { services, refreshTrips } = useApp(), o = useOverlay(), nav = useNavigate();
  const [stage, setStage] = useState<"brief" | "working" | "review">("brief");
  const [b, setB] = useState<Brief>({ destination: "", startDate: addDays(today(), 30), days: 5, travellers: 2, budget: "", currency: "AUD", interests: ["Food", "Culture"], pace: "BALANCED", notes: "" });
  const [plan, setPlan] = useState<AiPlanDraft | null>(null), [err, setErr] = useState<Record<string, string>>({});
  const [covers, setCovers] = useState<CoverPhoto[] | null>(null), [cover, setCover] = useState<Cover>({ kind: "library" }), [saving, setSaving] = useState(false);
  const run = useRef(0);
  useEffect(() => () => covers?.forEach((c) => URL.revokeObjectURL(c.url)), [covers]);

  const generate = async (e?: FormEvent) => {
    e?.preventDefault();
    const dest = b.destination.trim(), bc = b.budget.trim() ? cents(b.budget) : null;
    const next: Record<string, string> = {};
    if (!dest) next.dest = "Where to?"; else if (!b.startDate || b.startDate < today()) next.dest = "Pick a start date from today";
    else if (!b.interests.length) next.ai = "Pick at least one interest"; else if (b.budget.trim() && bc == null) next.ai = "Budget must be 0 or more, with up to 2 decimal places";
    else if (bc != null && bc > 9999999999) next.ai = "Budget must be at most 99,999,999.99";
    setErr(next); if (Object.keys(next).length) return;
    const my = ++run.current; setStage("working");
    try {
      const draft = await generatePlan({ destination: dest, startDate: b.startDate, days: b.days, travellers: b.travellers, budget: bc == null ? null : bc / 100, baseCurrency: b.currency, interests: b.interests, pace: b.pace, notes: b.notes.trim() });
      if (my !== run.current) return;
      setPlan(draft); setCover({ kind: "library" }); setStage("review"); setCovers(services.placePhotos ? null : []);
      if (services.placePhotos) fetchCoverOptions(draft.destination).then(async (options) => {
        const list = await Promise.all(options.map(async (c) => { try { return { name: c.photo, landmark: c.landmark, url: URL.createObjectURL(await fetchCoverPhoto(c.photo)) }; } catch { return null; } }));
        if (my !== run.current) return;
        const found = list.filter((x): x is CoverPhoto => !!x);
        setCovers(found);
        if (found[0]) setCover({ kind: "google", ...found[0] });
      }).catch(() => { if (my === run.current) setCovers([]); });
    } catch (ex) { if (my !== run.current) return; setStage("brief"); setErr({ dest: apiErrorMessage(ex, "The AI planner couldn't make a plan. Try again.") }); }
  };
  const create = async () => {
    if (!plan || !plan.tripName.trim()) { o.toast("Name the trip"); return; }
    setSaving(true);
    try {
      let t = await savePlan({ tripName: plan.tripName.trim(), destination: plan.destination, startDate: plan.startDate, endDate: plan.endDate, plannedBudget: plan.plannedBudget, baseCurrency: plan.baseCurrency, activities: plan.activities });
      if (cover.kind === "google") { try { t = await uploadTripCover(t.tripId, await fetchCoverPhoto(cover.name)); } catch { /* keep the library picture */ } }
      await refreshTrips(); nav(`/trip/${t.tripId}/overview`); o.toast("Trip created");
    } catch (ex) { o.toast(apiErrorMessage(ex, "Could not create the trip")); } finally { setSaving(false); }
  };

  if (stage === "working") return <Working key="plan" title={b.destination} sub={`${plural(b.days, "day")} · ${plural(b.travellers, "traveller")}`} steps={STEPS} pace={4000} onCancel={() => { run.current++; setStage("brief"); }} />;
  if (saving && plan) return <Working key="save" title={plan.tripName} sub={plural(plan.activities.length, "place")} steps={SAVE_STEPS} pace={2500} />;

  if (stage === "review" && plan) {
    const byDay = plan.days.map((d) => ({ ...d, stops: plan.activities.map((a, i) => ({ a, i })).filter((x) => x.a.date === d.date).sort((x, y) => (x.a.startTime ?? "") < (y.a.startTime ?? "") ? -1 : 1) }));
    const budget = plan.budgetBreakdown, total = sum(budget.map((x) => x.amount)), over = plan.plannedBudget > 0 && total > plan.plannedBudget;
    const setStop = (i: number, name: string) => setPlan({ ...plan, activities: plan.activities.map((a, k) => (k === i ? { ...a, name } : a)) });
    return <>
      <div className="sec-head"><h1>Your plan</h1><span style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-ghost" onClick={() => setStage("brief")}><Icon n="left" s={16} />Brief</button>
        <button type="button" className="btn btn-outline" onClick={() => generate()}><Icon n="refresh" s={16} />Regenerate</button></span></div>
      <div className="view-split"><div className="col">{byDay.map((d, di) => <section key={d.date} className="card pad plan-day">
        <div className="sec-head" style={{ marginBottom: 6 }}><h3>Day {di + 1} · <span className="muted num">{fwd(d.date)} {fd(d.date)}</span></h3>{d.theme && <Chip text={d.theme} />}</div>
        {d.stops.length ? d.stops.map(({ a, i }) => <div key={i} className="plan-stop"><span className="num hint">{hm(a.startTime)}</span>
          <span className={"cat-" + catKey(a.category)} style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 10 }}><Icon n={catIcon(a.category)} s={16} /></span>
          <input value={a.name} maxLength={160} aria-label="Stop name" onChange={(e) => setStop(i, e.target.value)} />
          <span className="num hint">{a.estimatedCost ? money(a.estimatedCost, plan.baseCurrency, { short: true }) : "Free"}</span>
          <button type="button" className="icon-btn sm" aria-label="Remove stop" onClick={() => setPlan({ ...plan, activities: plan.activities.filter((_, k) => k !== i) })}><Icon n="x" s={15} /></button></div>)
          : <div className="hint" style={{ padding: "10px 0" }}>Free day</div>}
      </section>)}</div>
      <div className="col"><section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label className="field">Trip name<input className="input" maxLength={100} value={plan.tripName} onChange={(e) => setPlan({ ...plan, tripName: e.target.value })} /></label>
        <div className="meta"><Icon n="pin" s={14} />{plan.destination} · {frange(plan.startDate, plan.endDate)}</div>{plan.summary && <div className="hint">{plan.summary}</div>}
        <CoverPicker plan={plan} covers={covers} cover={cover} onPick={setCover} />
        <div><div className="sec-head"><b>Budget</b><b className="num" style={{ color: over ? "var(--bad-text)" : "inherit" }}>{money(total, plan.baseCurrency, { short: true })}{plan.plannedBudget > 0 && <span className="muted"> / {money(plan.plannedBudget, plan.baseCurrency, { short: true })}</span>}</b></div>
          {budget.map((x) => <div key={x.category} style={{ marginTop: 10 }}><div className="kv" style={{ padding: "0 0 6px", border: 0 }}><span style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="cat-dot" style={{ background: catColor(x.category) }} />{x.category}</span><span className="num">{money(x.amount, plan.baseCurrency, { short: true })}</span></div>
            <div className="bar" style={{ height: 6 }}><i style={{ width: Math.round(x.amount / (Math.max(total, plan.plannedBudget) || 1) * 100) + "%", background: catColor(x.category) }} /></div></div>)}</div>
        <span className="star star-block"><button type="button" className="btn btn-primary btn-block" disabled={!plan.activities.length || saving} onClick={create}><Icon n="check" s={17} />Create trip · {plural(plan.activities.length, "place")}</button></span>
      </section></div></div>
    </>;
  }

  return <>
    <section className="card fx-card ai-hero"><FxCanvas card /><div className="fx-in"><h1 className="shiny">AI planner</h1>{!services.aiRecommendations && <Chip text="AI is off" cls="c-warn" icon="ban" />}</div></section>
    <form className="card pad" style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 880, width: "100%" }} onSubmit={generate} noValidate>
      <div className="row2"><label className="field">Destination<input className="input" maxLength={100} value={b.destination} onChange={(e) => setB({ ...b, destination: e.target.value })} placeholder="Kyoto, Japan" autoFocus /></label>
        <label className="field">Start<input className="input num" type="date" min={today()} value={b.startDate} onChange={(e) => setB({ ...b, startDate: e.target.value })} /></label></div>
      <FieldErr msg={err.dest} />
      <div className="row3"><Stepper label="Days" value={b.days} min={1} max={10} onChange={(days) => setB({ ...b, days })} /><Stepper label="Travellers" value={b.travellers} min={1} max={20} onChange={(travellers) => setB({ ...b, travellers })} />
        <div className="field"><span>Budget <small>· optional</small></span><div style={{ display: "flex", gap: 6 }}><input className="input num" type="number" min="0" max="99999999.99" step="0.01" value={b.budget} placeholder="AI suggests" aria-label="Budget (optional)" onChange={(e) => setB({ ...b, budget: e.target.value })} />
          <select className="input" style={{ width: 96 }} aria-label="Currency" value={b.currency} onChange={(e) => setB({ ...b, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div></div></div>
      <div className="field">Interests <small className="num">{b.interests.length}/8</small><div className="interest-grid">{INTERESTS.map(([x, icon]) => { const on = b.interests.includes(x); return <label key={x}>
        <input type="checkbox" checked={on} disabled={!on && b.interests.length >= 8} onChange={(e) => setB({ ...b, interests: e.target.checked ? [...b.interests, x] : b.interests.filter((i) => i !== x) })} /><span><Icon n={icon} s={22} />{x}</span></label>; })}</div></div>
      <div className="field">Pace<div><Seg name="aiPace" value={b.pace} onChange={(pace) => setB({ ...b, pace })} options={[["RELAXED", "Relaxed"], ["BALANCED", "Balanced"], ["PACKED", "Packed"]]} /></div></div>
      <label className="field">Notes <small className="num">{b.notes.length}/300</small><textarea className="input" maxLength={300} rows={2} placeholder="Vegetarian, no early starts" value={b.notes} onChange={(e) => setB({ ...b, notes: e.target.value })} /></label>
      <FieldErr msg={err.ai} />
      <div className="dlg-foot"><span className="star"><button className="btn btn-primary" data-tour="plan" disabled={!services.aiRecommendations}><Icon n="sparkle" s={17} />Plan my trip</button></span></div>
    </form>
  </>;
}

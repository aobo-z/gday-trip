import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createTrip, deleteTrip, removeTripCover, updateTrip, uploadTripCover, type TripResponse } from "../api/tripApi";
import { apiErrorMessage } from "../api/apiError";
import { useApp } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { DlgHead } from "../ui/Overlay";
import { FieldErr, Icon } from "../ui/kit";
import { coverOf, isOwner, nearestTrip } from "../lib/domain";
import { addDays, cents, CURRENCIES, today } from "../lib/format";
import { IMAGE_ACCEPT, prepareImage } from "../lib/prepareImage";

/** Create or edit a trip (CreateTripRequest / UpdateTripRequest; the cover is its own upload). */
export default function TripForm({ trip, onSaved }: { trip?: TripResponse; onSaved?: (t: TripResponse) => void }) {
  const o = useOverlay(), app = useApp(), nav = useNavigate();
  const [v, setV] = useState({ name: trip?.name ?? "", destination: trip?.destination ?? "", startDate: trip?.startDate ?? addDays(today(), 30), endDate: trip?.endDate ?? addDays(today(), 34),
    plannedBudget: trip ? String(trip.plannedBudget) : "", baseCurrency: trip?.baseCurrency ?? "AUD" });
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<string | null>(null);
  const [dropCover, setDropCover] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  /* Shrunk in the browser first (FR-3), so a large phone photo still fits the server's 5 MB limit. */
  const [preparing, setPreparing] = useState(false);
  const choose = async (f: File) => {
    setPreparing(true); setErr((cur) => { const next = { ...cur }; delete next.form; return next; });
    try { const p = await prepareImage(f); setFile(p); setPreview(URL.createObjectURL(p)); setDropCover(false); }
    catch (ex) { setErr((cur) => ({ ...cur, form: apiErrorMessage(ex, "That image can't be used") })); } finally { setPreparing(false); }
  };
  const hasUpload = !!file || (!!trip?.coverImageId && !dropCover);
  const shown = preview ?? (hasUpload && trip ? coverOf(trip) : coverOf({ tripId: trip?.tripId ?? 0, destination: v.destination }));
  const lockCur = !!trip && trip.canChangeBaseCurrency === false;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = v.name.trim(), destination = v.destination.trim(), bc = cents(v.plannedBudget);
    const next: Record<string, string> = {};
    if (!name) next.name = "Trip name is required"; else if (!destination) next.name = "Destination is required";
    if (v.endDate < v.startDate) next.dates = "End date is before start";
    if (!v.plannedBudget.trim()) next.budget = "Planned budget is required"; else if (bc == null) next.budget = "Use 0 or more, with up to 2 decimal places"; else if (bc > 9999999999) next.budget = "Planned budget must be at most 99,999,999.99";
    setErr(next); if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const body = { name, destination, startDate: v.startDate, endDate: v.endDate, plannedBudget: bc! / 100, baseCurrency: v.baseCurrency };
      let saved = trip ? await updateTrip(trip.tripId, body) : await createTrip(body);
      if (file) saved = await uploadTripCover(saved.tripId, file);
      else if (trip?.coverImageId && dropCover) saved = await removeTripCover(saved.tripId);
      app.putTrip(saved); app.refreshTrips().catch(() => undefined);
      onSaved?.(saved);
      o.closeDialog();
      if (!trip) { nav(`/trip/${saved.tripId}/overview`); o.toast("Trip created"); } else o.toast("Saved");
    } catch (ex) { setErr({ form: apiErrorMessage(ex, "Could not save the trip") }); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!trip || !(await o.confirm({ title: `Delete ${trip.name}?`, body: "Plans, votes and expenses are deleted for everyone.", label: "Delete trip", danger: true }))) return;
    try { await deleteTrip(trip.tripId); const list = await app.refreshTrips(); const next = nearestTrip(list); nav(next ? `/trip/${next.tripId}/overview` : "/trips"); o.toast("Trip deleted"); }
    catch (ex) { o.toast(apiErrorMessage(ex, "Could not delete the trip")); }
  };

  return <form onSubmit={submit} noValidate>
    <DlgHead title={trip ? "Edit trip" : "New trip"} onClose={o.closeDialog} />
    <label className="field">Trip name<input className="input" maxLength={100} value={v.name} onChange={set("name")} placeholder="Autumn in Kyoto" autoFocus aria-invalid={!!err.name && !v.name.trim()} /></label>
    <label className="field">Destination<span className="input-ico"><Icon n="pin" s={17} /><input className="input" maxLength={100} value={v.destination} onChange={set("destination")} placeholder="Kyoto, Japan" /></span></label>
    <FieldErr msg={err.name} />
    <div className="row2"><label className="field">Start<input className="input num" type="date" value={v.startDate} onChange={set("startDate")} /></label>
      <label className="field">End<input className="input num" type="date" value={v.endDate} min={v.startDate} onChange={set("endDate")} /></label></div>
    <FieldErr msg={err.dates} />
    <div className="row2"><label className="field">Budget<input className="input num" type="number" min="0" max="99999999.99" step="0.01" value={v.plannedBudget} onChange={set("plannedBudget")} placeholder="4000" /></label>
      <label className="field">Base currency<select className="input" value={v.baseCurrency} onChange={set("baseCurrency")} disabled={lockCur}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        {lockCur && <small><Icon n="info" s={12} /> Locked after the first expense</small>}</label></div>
    <FieldErr msg={err.budget} />
    <div className="field">Cover
      <div className="cover-up has auto" style={{ backgroundImage: `url('${shown}')` }}>
        <span className="cover-cta" role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}><Icon n="upload" s={16} />{hasUpload ? "Replace" : "Upload"}</span>
        {hasUpload && <button type="button" className="icon-btn sm cover-x" aria-label="Remove cover" onClick={() => { setFile(null); setPreview(null); setDropCover(true); }}><Icon n="x" s={16} /></button>}
      </div>
      <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) choose(f); }} />
    </div>
    <FieldErr msg={err.form} />
    <div className="dlg-foot">
      {trip && isOwner(trip) && <button type="button" className="btn btn-danger" style={{ marginRight: "auto" }} onClick={remove}><Icon n="trash" s={16} />Delete</button>}
      <button type="button" className="btn btn-ghost" onClick={o.closeDialog}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || preparing}>{trip ? "Save" : "Create trip"}</button>
    </div>
  </form>;
}

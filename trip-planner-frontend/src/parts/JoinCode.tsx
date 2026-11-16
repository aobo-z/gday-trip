import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { joinTripByCode, previewTripByCode, type TripInvitePreviewResponse } from "../api/tripApi";
import { apiErrorMessage } from "../api/apiError";
import { useApp } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { DlgHead } from "../ui/Overlay";
import { Chip, FieldErr, Icon } from "../ui/kit";
import { STATUS, coverOf, finished } from "../lib/domain";
import { frange } from "../lib/format";

export function TripPreviewCard({ p }: { p: TripInvitePreviewResponse }) {
  return <div className="toned img-head tone-sky" style={{ padding: 18, borderRadius: 18, animation: "pop 200ms var(--ease-out)", backgroundImage: `url('${coverOf(p)}')` }}>
    <div className="kicker">{p.destination}</div>
    <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.03em" }}>{p.name}</div>
    <div className="figs" style={{ marginTop: 8, color: "inherit" }}><span><Icon n="cal" s={15} />{frange(p.startDate, p.endDate)}</span><span><Icon n="users" s={15} />{p.memberCount}</span>
      <Chip text={STATUS[p.status]?.[0] ?? p.status} cls={STATUS[p.status]?.[1]} /></div>
  </div>;
}

/** Find a trip by invite code (GET /trips/join/{code}), then join it. */
export default function JoinCode() {
  const o = useOverlay(), app = useApp(), nav = useNavigate();
  const [code, setCode] = useState(""), [preview, setPreview] = useState<TripInvitePreviewResponse | null>(null);
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const closed = !!preview && !preview.alreadyMember && finished(preview);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase(); if (!c) return setErr("Enter a code");
    setBusy(true); setErr("");
    try {
      if (preview) {
        if (!preview.alreadyMember) await joinTripByCode(c);
        await app.refreshTrips(); o.closeDialog(); nav(`/trip/${preview.tripId}/overview`);
        if (!preview.alreadyMember) o.toast("Joined " + preview.name);
      } else setPreview(await previewTripByCode(c));
    } catch (ex) { setPreview(null); setErr(apiErrorMessage(ex, "No trip with this code")); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} noValidate>
    <DlgHead title="Join with code" onClose={o.closeDialog} />
    <label className="field">Invite code<input className="input" autoComplete="off" placeholder="AB12CD34" autoFocus value={code}
      style={{ textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 }} onChange={(e) => { setCode(e.target.value); setPreview(null); }} /></label>
    <FieldErr msg={err} />
    {preview && <TripPreviewCard p={preview} />}
    {closed && <p className="hint" role="status" style={{ margin: 0 }}><Icon n="archive" s={14} /> This trip has finished, so it can't be joined any more.</p>}
    <div className="dlg-foot"><button type="button" className="btn btn-ghost" onClick={o.closeDialog}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || closed}>{!preview ? "Find trip" : preview.alreadyMember ? "Open trip" : "Join trip"}</button></div>
  </form>;
}

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { joinTripByCode, previewTripByCode, type TripInvitePreviewResponse } from "../api/tripApi";
import { apiErrorMessage } from "../api/apiError";
import { useApp } from "../lib/stores";
import { Empty, FxCanvas, Icon, Spinner } from "../ui/kit";
import { TripPreviewCard } from "../parts/JoinCode";
import { finished } from "../lib/domain";

/** Opened from an invite link or QR (/join/{code}): preview the trip, then join. */
export default function Join() {
  const { code = "" } = useParams(), nav = useNavigate(), app = useApp();
  const [p, setP] = useState<TripInvitePreviewResponse | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { previewTripByCode(code).then(setP).catch((e) => setErr(apiErrorMessage(e, "This invite link isn't valid any more."))); }, [code]);
  /* The backend refuses to add anyone to an archived or shared trip, so say so instead of offering a button that fails. */
  const closed = !!p && !p.alreadyMember && finished(p);
  const join = async () => {
    if (!p) return; setBusy(true);
    try { if (!p.alreadyMember) await joinTripByCode(code); await app.refreshTrips(); nav(`/trip/${p.tripId}/overview`, { replace: true }); }
    catch (e) { setErr(apiErrorMessage(e, "Could not join this trip")); setBusy(false); }
  };
  return <div id="auth"><FxCanvas />
    <div className="auth-card" style={{ position: "relative", zIndex: 2, width: "min(440px, 100%)" }}>
      <div className="brand" style={{ padding: 0 }}>G’Day Trip</div>
      {err ? <Empty icon="alert" text={err}><button type="button" className="btn btn-outline btn-sm" onClick={() => nav("/trips")}>My trips</button></Empty>
        : !p ? <div className="empty"><Spinner /></div>
        : <><TripPreviewCard p={p} />
          {closed ? <p className="hint" role="status" style={{ textAlign: "center", margin: 0 }}><Icon n="archive" s={14} /> This trip has finished, so it can't be joined any more.</p>
            : <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={join}>{p.alreadyMember ? "Open trip" : "Join trip"}</button>}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => nav("/")}>Not now</button></>}
    </div>
  </div>;
}

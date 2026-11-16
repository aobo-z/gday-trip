import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { respondToInvitation, type TripResponse } from "../api/tripApi";
import { apiErrorMessage } from "../api/apiError";
import { useApp } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { Chip, Empty, Icon, Seg } from "../ui/kit";
import { STATUS, activeTrips, countdown, coverOf, editable, finished, isOwner, toneOf } from "../lib/domain";
import { dayDiff, fd, frange, money } from "../lib/format";
import TripForm from "../parts/TripForm";
import JoinCode from "../parts/JoinCode";
import { Thumb } from "../parts/Shell";

function TripCard({ t }: { t: TripResponse }) {
  const nav = useNavigate(), { summaries } = useApp(), s = summaries[t.tripId];
  const c = countdown(t), spent = s?.spent ?? 0, pct = Math.min(100, Math.round(spent / (t.plannedBudget || 1) * 100));
  return <button type="button" className={"card tcard spot " + toneOf(t.tripId)} onClick={() => nav(`/trip/${t.tripId}/overview`)}>
    <div className="tcard-media img" style={{ backgroundImage: `linear-gradient(to top, rgba(12,16,28,.55), rgba(12,16,28,0) 60%),url('${coverOf(t)}')` }}>
      <span className="chips">{editable(t) ? <Chip text={c.label} cls={c.rank === 0 ? "c-good" : c.rank === 2 ? "c-warn" : "c-blue"} icon="clock" />
        : <Chip text={STATUS[t.status]?.[0] ?? t.status} cls={STATUS[t.status]?.[1]} />}{isOwner(t) && <Chip text="Owner" />}</span>{t.destination.split(",")[0]}</div>
    <div className="tcard-body"><h3 className="clamp2 tcard-title" title={t.name}>{t.name}</h3><div className="meta"><Icon n="cal" s={14} />{frange(t.startDate, t.endDate)} · {dayDiff(t.startDate, t.endDate) + 1}d</div>
      <div className="figs"><span title="Travellers"><Icon n="users" s={14} />{s?.members.length ?? "–"}</span><span title="Scheduled activities"><Icon n="cal" s={14} />{s ? s.scheduledPlans : "–"}</span>
        <span title="Spent"><Icon n="wallet" s={14} />{money(spent, t.baseCurrency ?? "AUD", { short: true })}</span></div>
      <div className="bar" style={{ height: 6 }}><i style={{ width: pct + "%" }} /></div></div>
  </button>;
}

type F = "active" | "past";
export default function Trips() {
  const app = useApp(), o = useOverlay(), nav = useNavigate();
  const [f, setF] = useState<F>("active");
  const active = (t: TripResponse) => !finished(t);
  /* Upcoming: under way first, then the soonest to start (same order as the trip switcher). Past: most recent first. */
  const list = f === "active" ? activeTrips(app.trips)
    : app.trips.filter((t) => !active(t)).sort((a, b) => b.startDate.localeCompare(a.startDate) || b.tripId - a.tripId);
  const respond = async (memberId: number, tripId: number, action: "ACCEPT" | "REJECT") => {
    try { await respondToInvitation(memberId, action); await Promise.all([app.refreshInvitations(), app.refreshTrips()]); if (action === "ACCEPT") { o.toast("Joined"); nav(`/trip/${tripId}/overview`); } }
    catch (e) { o.toast(apiErrorMessage(e, "Could not answer the invitation")); }
  };
  return <>
    <div className="sec-head"><h1>Trips</h1><span style={{ display: "flex", gap: 10 }}>
      <button type="button" className="btn btn-outline" data-tour="join" onClick={() => o.dialog(<JoinCode />)}><Icon n="door" s={17} />Join with code</button>
      <button type="button" className="btn btn-primary" onClick={() => o.dialog(<TripForm />)}><Icon n="plus" s={17} />New trip</button></span></div>
    {app.invitations.length > 0 && <section className="card pad"><h3>Invitations<span className="n num">{app.invitations.length}</span></h3>
      {app.invitations.map((i) => <div key={i.tripMemberId} className="list-row"><Thumb t={{ tripId: i.tripId, destination: i.tripDestination }} size={46} r={14} />
        <span style={{ flex: 1 }}><b>{i.tripName}</b><span className="meta">{i.tripDestination} · invited {fd(i.joinedAt)}</span></span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => respond(i.tripMemberId, i.tripId, "REJECT")}>Decline</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => respond(i.tripMemberId, i.tripId, "ACCEPT")}>Join</button></div>)}</section>}
    <Seg name="tripFilter" value={f} onChange={setF} options={[["active", "Upcoming", app.trips.filter(active).length], ["past", "Past", app.trips.filter((t) => !active(t)).length]]} />
    {list.length ? <div className="grid">{list.map((t) => <TripCard key={t.tripId} t={t} />)}</div>
      : <Empty icon="grid" text="No trips here"><button type="button" className="btn btn-primary btn-sm" onClick={() => o.dialog(<TripForm />)}><Icon n="plus" s={15} />New trip</button></Empty>}
  </>;
}

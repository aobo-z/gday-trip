import { useCallback, useEffect, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { fetchInviteCode, fetchPendingTripInvites, inviteTripMember, regenerateInviteCode, removeTripMember, updateTripMemberRole, type TripMemberResponse } from "../api/tripApi";
import { apiErrorMessage } from "../api/apiError";
import { useApp, useMe, useTrip } from "../lib/stores";
import { useNavigate } from "react-router-dom";
import { useOverlay } from "../ui/overlayContext";
import { DlgHead } from "../ui/Overlay";
import { Avatar, Chip, FieldErr, Icon } from "../ui/kit";
import { editable, isOwner, nearestTrip } from "../lib/domain";
import { fd } from "../lib/format";
import { usePeek } from "./usePeek";

/** The join route is /join/{inviteCode} on whatever host serves the app. */
const joinUrl = (code: string) => `${window.location.origin}/join/${code}`;

function Invite({ onInvited }: { onInvited: () => void }) {
  const { trip } = useTrip(), o = useOverlay();
  const [code, setCode] = useState(""), [email, setEmail] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { fetchInviteCode(trip.tripId).then((r) => setCode(r.inviteCode)).catch((e) => setErr(apiErrorMessage(e, "Could not load the invite code"))); }, [trip.tripId]);
  const copy = (text: string, msg: string) => { navigator.clipboard?.writeText(text).catch(() => undefined); o.toast(msg); };
  const regen = async () => {
    if (!(await o.confirm({ title: "Make a new code?", body: "The old code and QR stop working.", label: "New code" }))) { o.dialog(<Invite onInvited={onInvited} />); return; }
    try { const r = await regenerateInviteCode(trip.tripId); o.dialog(<Invite onInvited={onInvited} />); o.toast("New code " + r.inviteCode); } catch (e) { o.toast(apiErrorMessage(e, "Code not changed")); }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) return setErr("Enter a valid email");
    setBusy(true); setErr("");
    try { const m = await inviteTripMember(trip.tripId, { email: v }); setEmail(""); onInvited(); o.toast("Invited " + m.username); }
    catch (ex) { setErr(apiErrorMessage(ex, "Invite not sent")); } finally { setBusy(false); }
  };
  const link = code ? joinUrl(code) : "";
  return <div className="dlg-body">
    <DlgHead title={"Invite to " + trip.name} onClose={o.closeDialog} />
    <div className="inv-grid">
      <div className="qr-card">{link ? <QRCodeSVG value={link} level="Q" marginSize={2} className="qr" title="QR code for the join link" /> : <div className="qr-miss"><Icon n="qr" s={40} /></div>}</div>
      <div className="inv-side">
        <small className="hint">Code</small>
        <div className="inv-code"><span className="code num">{code || "…"}</span>
          <button type="button" className="icon-btn sm" aria-label="Copy code" onClick={() => copy(code, "Code copied")} disabled={!code}><Icon n="copy" s={16} /></button>
          {isOwner(trip) && <button type="button" className="icon-btn sm" aria-label="New code" onClick={regen}><Icon n="refresh" s={16} /></button>}</div>
        <small className="hint">Link</small>
        <div className="inv-link"><span className="num">{link.replace(/^https?:\/\//, "")}</span><button type="button" className="icon-btn sm" aria-label="Copy link" onClick={() => copy(link, "Link copied")} disabled={!link}><Icon n="link" s={16} /></button></div>
        {"share" in navigator && link && <button type="button" className="btn btn-outline btn-sm" onClick={() => navigator.share({ title: trip.name, text: `Join ${trip.name} on G'Day Trip`, url: link }).catch(() => undefined)}><Icon n="share" s={15} />Share</button>}
      </div>
    </div>
    <form className="inv-email" onSubmit={send} noValidate>
      <input className="input" type="email" maxLength={100} autoComplete="off" placeholder="name@example.com" aria-label="Invite by email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn btn-solid" disabled={busy}><Icon n="mail" s={16} />Send</button>
      <FieldErr msg={err} />
    </form>
  </div>;
}

/** Owners manage members in place: the role pill switches Owner/Member, × removes (or cancels an invite). */
export default function Members() {
  const store = useTrip(), me = useMe(), o = useOverlay(), peek = usePeek(), app = useApp(), nav = useNavigate();
  const { trip, members } = store, owner = isOwner(trip) && editable(trip);
  const [pending, setPending] = useState<TripMemberResponse[]>([]);
  const loadPending = useCallback(() => { fetchPendingTripInvites(trip.tripId).then(setPending).catch(() => setPending([])); }, [trip.tripId]);
  useEffect(loadPending, [loadPending]);
  const owners = members.filter((m) => m.role === "OWNER").length;
  const toggle = async (m: TripMemberResponse) => {
    const next = m.role === "OWNER" ? "MEMBER" : "OWNER";
    if (next === "MEMBER" && owners < 2) { o.toast("A trip needs at least one owner"); return; }
    try { await updateTripMemberRole(trip.tripId, m.tripMemberId, { role: next }); await store.reloadMembers(); o.toast(m.username + (next === "OWNER" ? " is now an owner" : " is now a member")); }
    catch (e) { o.toast(apiErrorMessage(e, "Role not changed")); }
  };
  const remove = async (m: TripMemberResponse) => {
    const isPending = m.inviteStatus === "PENDING";
    if (!isPending && m.role === "OWNER" && owners < 2) { o.toast("A trip needs at least one owner"); return; }
    if (!isPending && !(await o.confirm({ title: `Remove ${m.username}?`, label: "Remove", danger: true }))) return;
    try {
      await removeTripMember(trip.tripId, m.tripMemberId);
      if (!isPending) { await Promise.all([store.reloadMembers(), store.refreshActivities()]); o.toast(m.username + " removed"); return; }
      /* Cancelling an invite takes one tap, so it can be undone: the same person is simply invited again. */
      loadPending();
      o.toast("Invite to " + m.username + " cancelled", () => {
        inviteTripMember(trip.tripId, { email: m.email }).then(() => { loadPending(); o.toast("Invited " + m.username + " again"); })
          .catch((e) => o.toast(apiErrorMessage(e, "Invite not sent again")));
      });
    } catch (e) { o.toast(apiErrorMessage(e, "Could not remove")); }
  };
  /* Leaving deletes my own membership. The backend refuses the last owner, so the button says why up front. */
  const myself = members.find((m) => m.userId === me.userId);
  const lastOwner = myself?.role === "OWNER" && owners < 2, soleMember = members.length === 1;
  const blocked = !lastOwner ? undefined : soleMember ? "You're the only traveller: delete the trip from Edit trip instead" : "Make another traveller an owner before you leave";
  const leave = async () => {
    if (!myself) return;
    if (!(await o.confirm({ title: `Leave ${trip.name}?`, label: "Leave trip", danger: true,
      body: "You'll lose access to its plans, votes and expenses until someone invites you back." }))) return;
    try {
      await removeTripMember(trip.tripId, myself.tripMemberId);
      const list = await app.refreshTrips(), next = nearestTrip(list);
      nav(next ? `/trip/${next.tripId}/overview` : "/trips", { replace: true });
      o.toast("You left " + trip.name);
    } catch (e) { o.toast(apiErrorMessage(e, "Could not leave the trip")); }
  };
  const all = [...[...members].sort((a, b) => Number(b.role === "OWNER") - Number(a.role === "OWNER")), ...pending];
  return <section className="card pad mem-card">
    <div className="sec-head"><h3><Icon n="users" s={17} /> Travellers<span className="n num">{members.length}</span></h3>
      <span className="mem-actions">
        {myself && <button type="button" className="btn btn-ghost btn-sm mem-leave" aria-disabled={lastOwner || undefined} onClick={() => (blocked ? o.toast(blocked) : leave())} title={blocked}><Icon n="logout" s={15} />Leave trip</button>}
        {editable(trip) && <button type="button" className="btn btn-primary btn-sm" onClick={() => o.dialog(<Invite onInvited={loadPending} />)}><Icon n="qr" s={15} />Invite</button>}</span></div>
    <div className="mem-grid">{all.map((m) => {
      const mine = m.userId === me.userId, isPending = m.inviteStatus === "PENDING", isOwn = m.role === "OWNER";
      return <div key={m.tripMemberId} className={"mem-tile" + (isPending ? " pending" : "")}>
        <Avatar id={m.userId} name={m.username} onClick={() => peek.person(m.userId, m.username)} />
        <span className="mem-name">{m.username}{mine && <span className="muted"> · you</span>}<small className="num">{isPending ? "Invite sent" : "Joined " + fd(m.joinedAt)}</small></span>
        {isPending ? <Chip text="Invited" cls="c-warn" icon="mail" />
          : owner && !mine ? <button type="button" className={"role-pill" + (isOwn ? " owner" : "")} onClick={() => toggle(m)} aria-label={`${m.username} is ${isOwn ? "an owner" : "a member"}, switch`}>{isOwn && <Icon n="shield" s={13} />}{isOwn ? "Owner" : "Member"}</button>
          : <span className={"role-pill static" + (isOwn ? " owner" : "")}>{isOwn && <Icon n="shield" s={13} />}{isOwn ? "Owner" : "Member"}</span>}
        {owner && !mine && <button type="button" className="icon-btn sm mem-x" aria-label={(isPending ? "Cancel invite for " : "Remove ") + m.username} onClick={() => remove(m)}><Icon n="x" s={15} /></button>}
      </div>;
    })}</div>
  </section>;
}

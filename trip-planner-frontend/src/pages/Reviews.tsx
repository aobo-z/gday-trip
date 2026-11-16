import { useState, type FormEvent } from "react";
import { fetchReviewableMembers, fetchUserReviews, fetchWrittenReviews, submitReview, type ReviewableMember, type ReviewResponse, type UserReviewSummary } from "../api/reviewApi";
import type { TripResponse } from "../api/tripApi";
import { apiErrorMessage } from "../api/apiError";
import { useApp, useMe } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { Avatar, Chip, Empty, Icon, LoadError, Seg, Spinner } from "../ui/kit";
import { useLoad } from "../lib/useLoad";
import { ICONS } from "../ui/icons";
import { STATUS, finished } from "../lib/domain";
import { frange } from "../lib/format";
import { Thumb } from "../parts/Shell";
import { resetReviewBadge } from "../lib/reviewBadge";
import { ReviewList } from "../parts/PersonDrawer";
import { usePeek } from "../parts/usePeek";

function ReviewRow({ t, m, onDone }: { t: TripResponse; m: ReviewableMember; onDone: () => void }) {
  const o = useOverlay(), peek = usePeek();
  const [rating, setRating] = useState(0), [comment, setComment] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!rating) return; setBusy(true);
    try { await submitReview(t.tripId, { revieweeId: m.userId, rating, comment: comment.trim() || undefined }); resetReviewBadge(); onDone(); o.toast("Review sent to " + m.username); }
    catch (ex) { o.toast(apiErrorMessage(ex, "Review not sent")); } finally { setBusy(false); }
  };
  return <form className="list-row" style={{ flexWrap: "wrap", alignItems: "center", padding: "16px 0" }} onSubmit={submit} noValidate>
    <Avatar id={m.userId} name={m.username} size={44} onClick={() => peek.person(m.userId, m.username)} /><b style={{ minWidth: 70 }}>{m.username}</b>
    <span className="stars" role="group" aria-label="Rating">{[1, 2, 3, 4, 5].map((i) => <button key={i} type="button" className={i <= rating ? "on" : ""} aria-label={i + " stars"} aria-pressed={i === rating} onClick={() => setRating(i)}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS.star }} /></button>)}</span>
    <input className="input" maxLength={2000} placeholder="A few words (optional)" style={{ flex: "1 1 220px" }} value={comment} onChange={(e) => setComment(e.target.value)} />
    <button className="btn btn-primary" disabled={!rating || busy}>Submit</button>
  </form>;
}

/** Reviews I've written, one collapsible group per trip (newest trip first, as the list arrives). */
function Written({ list }: { list: ReviewResponse[] | null }) {
  const app = useApp();
  if (!list) return <div className="empty"><Spinner /></div>;
  if (!list.length) return <section className="card"><Empty icon="edit" text="You haven't written any reviews" /></section>;
  const groups: { key: string; tripId: number | null; name: string; items: ReviewResponse[] }[] = [];
  list.forEach((r) => { const key = String(r.tripId ?? r.tripName); let g = groups.find((x) => x.key === key); if (!g) groups.push(g = { key, tripId: r.tripId, name: r.tripName ?? "Trip", items: [] }); g.items.push(r); });
  return <>{groups.map((g, i) => { const t = app.trips.find((x) => x.tripId === g.tripId);
    return <details key={g.key} className="card rv-group" open={i === 0}><summary>
      <Thumb t={t ?? { tripId: g.tripId ?? 0, destination: g.name }} size={40} r={12} /><span><h3>{g.name}</h3>{t && <span className="hint num">{frange(t.startDate, t.endDate)}</span>}</span>
      <Chip text={`${g.items.length} written`} icon="star" /><Icon n="chev" s={18} className="chev" /></summary>
      <ReviewList reviews={g.items} who="reviewee" showTrip={false} /></details>; })}</>;
}

/** Reviews open once a trip is archived: rate each fellow traveller once per trip. */
export default function Reviews() {
  const app = useApp(), me = useMe();
  const [tab, setTab] = useState<"todo" | "written" | "received">("todo");
  const [rev, setRev] = useState(0);
  /* Any failed request shows as an error with Retry, never as "Everyone's reviewed" or "No reviews yet". */
  const todoLoad = useLoad(() => Promise.all(app.trips.filter(finished).map(async (t) => ({ t, members: (await fetchReviewableMembers(t.tripId)).filter((m) => !m.alreadyReviewed) })))
    .then((list) => list.filter((x) => x.members.length)), [app.trips, rev], "Couldn't load who's left to review.");
  const writtenLoad = useLoad(fetchWrittenReviews, [rev], "Couldn't load the reviews you wrote.");
  const mineLoad = useLoad(() => fetchUserReviews(me.userId), [me.userId], "Couldn't load the reviews about you.");
  const todo = todoLoad.data ?? null, written = writtenLoad.data ?? null, mine: UserReviewSummary | null = mineLoad.data ?? null;
  const n = todo ? todo.reduce((s, x) => s + x.members.length, 0) : 0;
  return <>
    <div className="sec-head"><h1>Reviews</h1><Seg name="reviewTab" value={tab} onChange={setTab} options={[["todo", "To review", n], ["written", "Written", written?.length ?? 0], ["received", "About me", mine?.reviewCount ?? 0]]} /></div>
    {tab === "written" ? (writtenLoad.error && !written ? <section className="card"><LoadError text={writtenLoad.error} onRetry={writtenLoad.retry} /></section> : <Written list={written} />)
      : tab === "todo" ? (todoLoad.error && !todo ? <section className="card"><LoadError text={todoLoad.error} onRetry={todoLoad.retry} /></section> : !todo ? <div className="empty"><Spinner /></div> : todo.length ? todo.map(({ t, members }) => <section key={t.tripId} className="card pad">
      <div className="sec-head" style={{ marginBottom: 6 }}><span style={{ display: "flex", alignItems: "center", gap: 12 }}><Thumb t={t} size={40} r={12} /><span><h3>{t.name}</h3><span className="hint num">{frange(t.startDate, t.endDate)}</span></span></span>
        <Chip text={STATUS[t.status]?.[0] ?? t.status} cls={STATUS[t.status]?.[1]} /></div>
      {members.map((m) => <ReviewRow key={m.userId} t={t} m={m} onDone={() => setRev((x) => x + 1)} />)}
    </section>) : <section className="card"><Empty icon="star" text={app.trips.some(finished) ? "Everyone's reviewed" : "Reviews open once a trip is archived"} /></section>)
      : <section className="card pad">{mineLoad.error && !mine ? <LoadError text={mineLoad.error} onRetry={mineLoad.retry} /> : !mine ? <div className="empty"><Spinner /></div> : <>
        {mine.reviewCount > 0 && <div className="meta" style={{ marginBottom: 8 }}><Icon n="star" s={15} /><b className="num">{mine.averageRating.toFixed(1)}</b> · {mine.reviewCount} review{mine.reviewCount === 1 ? "" : "s"}</div>}
        <ReviewList reviews={mine.reviews} /></>}</section>}
  </>;
}

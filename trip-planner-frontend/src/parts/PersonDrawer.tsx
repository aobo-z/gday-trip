import { useEffect, useState } from "react";
import { fetchUserReviews, type ReviewResponse, type UserReviewSummary } from "../api/reviewApi";
import { useOverlay } from "../ui/overlayContext";
import { Avatar, Empty, Icon, Spinner, Stars } from "../ui/kit";
import { fd } from "../lib/format";
import { ICONS } from "../ui/icons";
import { usePeek } from "./usePeek";

export function RatingBars({ list }: { list: { rating: number }[] }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{[5, 4, 3, 2, 1].map((s) => {
    const n = list.filter((r) => r.rating === s).length;
    return <div key={s} style={{ display: "grid", gridTemplateColumns: "30px 1fr 22px", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700 }}>
      <span className="num rating-label">{s}<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS.star }} /></span><span className="bar" style={{ height: 6 }}><i style={{ width: (list.length ? n / list.length * 100 : 0) + "%", background: "#F5B301" }} /></span><span className="num muted">{n}</span></div>;
  })}</div>;
}
/** Reviews as rows. `who` picks whose face and name lead the row: the author (reviews received) or the person reviewed (reviews written). Faces open that person's profile. */
export function ReviewList({ reviews, who = "reviewer", showTrip = true }: { reviews: ReviewResponse[]; who?: "reviewer" | "reviewee"; showTrip?: boolean }) {
  const peek = usePeek();
  if (!reviews.length) return <Empty icon="star" text="No reviews yet" />;
  return <div className="rv-list">{reviews.map((r) => { const id = who === "reviewer" ? r.reviewerId : r.revieweeId, name = who === "reviewer" ? r.reviewerName : r.revieweeName;
    return <div key={r.reviewId} className="rv-row"><Avatar id={id} name={name} onClick={() => peek.person(id, name)} />
      <span className="rv-main"><span className="rv-top"><b>{name}</b><Stars n={r.rating} size={13} /><span className="hint num rv-date">{fd(r.createdAt)}</span></span>
        {showTrip && r.tripName && <span className="hint rv-trip"><Icon n="grid" s={12} />{r.tripName}</span>}
        {r.comment && <span className="rv-text">{r.comment}</span>}</span></div>; })}</div>;
}

/** Another traveller's profile: rating and the reviews they received (no account details). */
export default function PersonDrawer({ userId, name }: { userId: number; name: string }) {
  const o = useOverlay();
  const [data, setData] = useState<UserReviewSummary | null>(null), [err, setErr] = useState(false);
  useEffect(() => { fetchUserReviews(userId).then(setData).catch(() => setErr(true)); }, [userId]);
  return <>
    <div className="dlg-head"><span /><button type="button" className="icon-btn" aria-label="Close" onClick={o.closeDrawer}><Icon n="x" s={20} /></button></div>
    <section className="person-hero"><Avatar id={userId} name={name} size={76} /><h2>{name}</h2>
      {data && (data.reviewCount ? <div className="person-score"><b className="num">{data.averageRating.toFixed(1)}</b><Stars n={data.averageRating} /><span className="hint num">{data.reviewCount} review{data.reviewCount === 1 ? "" : "s"}</span></div>
        : <div className="person-score"><Stars n={0} /><span className="hint">No reviews yet</span></div>)}</section>
    {err ? <Empty icon="alert" text="Couldn't load this profile" /> : !data ? <div className="empty"><Spinner /></div> : data.reviewCount > 0 && <>
      <section className="preview"><RatingBars list={data.reviews} /></section>
      <section><h3 style={{ marginBottom: 4 }}>Reviews<span className="n num">{data.reviewCount}</span></h3><ReviewList reviews={data.reviews} /></section>
    </>}
  </>;
}

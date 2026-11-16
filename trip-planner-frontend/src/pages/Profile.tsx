import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchUserReviews, type UserReviewSummary } from "../api/reviewApi";
import { useApp, useMe } from "../lib/stores";
import { Avatar, Chip, CountUp, Icon, LoadError, Spinner, Stars } from "../ui/kit";
import { useLoad } from "../lib/useLoad";
import { finished } from "../lib/domain";
import { MON, pd } from "../lib/format";
import { RatingBars, ReviewList } from "../parts/PersonDrawer";

const SHOWN = 4;

/** Your own profile: who you are, your rating, a few of the latest reviews and the rating breakdown. */
export default function Profile() {
  const me = useMe(), app = useApp(), nav = useNavigate();
  const [all, setAll] = useState(false);
  const rvLoad = useLoad(() => fetchUserReviews(me.userId), [me.userId], "Couldn't load your reviews."), rv: UserReviewSummary | null = rvLoad.data ?? null;
  const done = app.trips.filter(finished).length, sinceDate = me.createdAt ? pd(me.createdAt.slice(0, 10)) : null;
  const reviews = rv ? (all ? rv.reviews : rv.reviews.slice(0, SHOWN)) : [];
  return <>
    <section className="card pad profile-hero">
      <Avatar id={me.userId} name={me.username} size={96} />
      <div className="profile-who"><h1>{me.username}</h1>
        <div className="meta"><Icon n="mail" s={14} />{me.email}{sinceDate && <> · <Icon n="cal" s={14} />since {MON[sinceDate.getMonth()]} {sinceDate.getFullYear()}</>}{me.role === "ADMIN" && <> · <Chip text="Admin" cls="c-violet" icon="shield" /></>}</div></div>
      <button type="button" className="btn btn-outline" onClick={() => nav("/settings")}><Icon n="gear" s={16} />Settings</button>
    </section>
    <div className="stats">
      <section className="stat card"><div className="stat-label">Rating<Icon n="star" s={18} /></div>
        <div className="stat-value num">{rv?.reviewCount ? rv.averageRating.toFixed(1) : "—"} <small>/ 5</small></div><Stars n={rv?.averageRating ?? 0} /></section>
      <section className="stat card"><div className="stat-label">Reviews<Icon n="msg" s={18} /></div>
        <div className="stat-value num"><CountUp value={rv?.reviewCount ?? 0} k="p-reviews" /></div></section>
      <section className="stat card"><div className="stat-label">Trips<Icon n="grid" s={18} /></div>
        <div className="stat-value num"><CountUp value={app.trips.length} k="p-trips" /> <small>· {done} done</small></div></section>
    </div>
    <div className="view-split">
      <section className="card pad"><h3 style={{ marginBottom: 4 }}>Received{rv && <span className="n num">{rv.reviewCount}</span>}</h3>
        {rvLoad.error && !rv ? <LoadError text={rvLoad.error} onRetry={rvLoad.retry} /> : !rv ? <div className="empty"><Spinner /></div> : <ReviewList reviews={reviews} />}
        {rv && rv.reviewCount > SHOWN && <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setAll(!all)}>
          <Icon n="chev" s={15} className={all ? "flip" : undefined} />{all ? "Show fewer" : `Show all ${rv.reviewCount}`}</button>}</section>
      <section className="card pad" style={{ alignSelf: "start" }}><h3 style={{ marginBottom: 14 }}>Breakdown</h3>{rv ? <RatingBars list={rv.reviews} /> : <div className="empty"><Spinner /></div>}</section>
    </div>
  </>;
}

import { useState } from "react";
import { useLocation } from "react-router-dom";
import type { ActivityResponse } from "../api/activityApi";
import { useApp, useTrip } from "../lib/stores";
import { useImage } from "../lib/images";
import { useOverlay } from "../ui/overlayContext";
import { Avatar, Chip, Empty, Icon, Seg } from "../ui/kit";
import { STATUS, catIcon, chipOf, editable, ideaKind, stageOf, toneOf } from "../lib/domain";
import { Prog, Tally, Threshold, VoteCell } from "../parts/TripBits";
import IdeaForm from "../parts/IdeaForm";
import { usePeek } from "../parts/usePeek";

function Media({ a }: { a: ActivityResponse }) {
  const url = useImage(a.imageUrls[0]);
  const [label, cls, icon] = chipOf(a), chip = <span className="chips"><Chip text={label} cls={cls} icon={icon} /></span>;
  if (url) return <div className="tcard-media img" style={{ backgroundImage: `linear-gradient(to top, rgba(12,16,28,.55), rgba(12,16,28,0) 60%),url('${url}')` }}>{chip}<span className="media-cat"><Icon n={catIcon(a.category)} s={15} />{a.category}</span></div>;
  return <div className={"tcard-media " + toneOf(a.id)}>{chip}<Icon n={catIcon(a.category)} s={30} /></div>;
}

/** A branch has left voting: instead of votes it shows who's going and when. */
function IdeaCard({ a }: { a: ActivityResponse }) {
  const peek = usePeek(), k = ideaKind(a);
  return <article className="card tcard spot" tabIndex={0} role="button" aria-label={a.name} onClick={() => peek.idea(a.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) peek.idea(a.id); }}>
    <Media a={a} />
    <div className="tcard-body"><h3 className="clamp2" title={a.name}>{a.name}</h3><div className="meta one" title={a.location || undefined}><Icon n="pin" s={14} /><span>{a.location || "No address"}</span></div>
      {/* Same row for every card: votes, or for a branch (which skipped voting) a quiet label in their place. */}
      <div className="card-votes">{a.branch ? <span className="branch-tag"><Icon n="branch" s={14} />Branch · No vote</span> : <><Prog a={a} /><Tally a={a} /></>}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
        <span className="figs"><Avatar id={a.createdById} name={a.createdByUsername} onClick={() => peek.person(a.createdById, a.createdByUsername)} /><span><Icon n="msg" s={14} />{a.commentCount}</span></span>
        {k !== "scheduled" && k !== "branch" && <span className="vote-acts"><VoteCell a={a} /></span>}
      </div>
    </div>
  </article>;
}

type Filter = "all" | "needs" | "voting" | "approved" | "scheduled" | "rejected";
export default function Vote() {
  const { trip: t, activities } = useTrip(), { services } = useApp(), o = useOverlay();
  const [filter, setFilter] = useState<Filter>(((useLocation().state as { filter?: Filter } | null)?.filter) ?? "all");
  const [q, setQ] = useState("");
  const cnt = (k: Filter) => activities.filter((a) => stageOf(a) === k).length;
  const query = q.trim().toLowerCase();
  const rank: Record<string, number> = { needs: 0, voting: 1, approved: 2, scheduled: 3, rejected: 4 };
  const list = activities.filter((a) => (filter === "all" || stageOf(a) === filter) && (!query || [a.name, a.location, a.tags.join(" "), a.category].join(" ").toLowerCase().includes(query)))
    .sort((a, b) => rank[stageOf(a)] - rank[stageOf(b)] || (a.createdAt < b.createdAt ? 1 : -1));
  const add = () => o.dialog(<IdeaForm />, { wide: true });
  const discover = () => o.dialog(<IdeaForm discover />, { wide: true });
  return <>
    <div className="sec-head"><h1>Activities<span className="n num">{activities.length}</span></h1>
      {editable(t) ? <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {services.placeSearch && <button type="button" className="btn btn-primary" data-tour="discover" onClick={discover}><Icon n="globe" s={17} />Discover</button>}
        <button type="button" className="btn btn-primary" data-tour="add-idea" onClick={add}><Icon n="plus" s={17} />Add activity</button></span>
        : <Chip text={(STATUS[t.status]?.[0] ?? t.status) + " · read-only"} />}</div>
    <section className="card pad thr-card"><Threshold wide /></section>
    <div className="sec-head">
      <Seg name="voteFilter" value={filter} onChange={setFilter} options={[["all", "All", activities.length], ["needs", "Needs my vote", cnt("needs")], ["voting", "Voting", cnt("voting")], ["approved", "To schedule", cnt("approved")], ["scheduled", "Scheduled", cnt("scheduled")], ["rejected", "Rejected", cnt("rejected")]]} />
      <label className="search" style={{ flex: "0 1 280px", background: "var(--card)" }}><Icon n="search" s={17} /><span className="sr">Filter activities</span><input type="search" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} /></label>
    </div>
    {list.length ? <div className="grid">{list.map((a) => <IdeaCard key={a.id} a={a} />)}</div>
      : <Empty icon="vote" text={filter === "needs" ? "You're all caught up" : "No activities match"}>{editable(t) && <button type="button" className="btn btn-outline btn-sm" onClick={add}><Icon n="plus" s={15} />Add activity</button>}</Empty>}
  </>;
}

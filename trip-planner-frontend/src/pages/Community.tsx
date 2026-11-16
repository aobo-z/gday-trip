import { useEffect, useState, type FormEvent } from "react";
import { copyCommunityPlace, deleteCommunityComment, fetchCommunityComments, fetchCommunityTrips, likeTrip, postCommunityComment, type CommunityComment, type CommunityPlace, type CommunityTrip } from "../api/communityApi";
import { apiErrorMessage } from "../api/apiError";
import { unpublishTrip } from "../api/tripApi";
import { useApp, useMaybeTrip } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { DlgHead } from "../ui/Overlay";
import { Avatar, Chip, Empty, FieldErr, Icon, LoadError, Seg, Spinner } from "../ui/kit";
import { useLoad } from "../lib/useLoad";
import { ICONS } from "../ui/icons";
import { catIcon, catKey, coverOf, editable, isOwner, toneOf } from "../lib/domain";
import { MON, ago, dayDiff, fd, frange, fwd, hm, pd, plural } from "../lib/format";
import { Thumb } from "../parts/Shell";
import Photo, { Thumb as PhotoThumb } from "../parts/Photo";

const PAGE_SIZE = 20;

function Like({ c, mine, onChange }: { c: CommunityTrip; mine: boolean; onChange: (c: CommunityTrip) => void }) {
  const o = useOverlay();
  const toggle = async () => {
    const next = !c.likedByMe; onChange({ ...c, likedByMe: next, likeCount: c.likeCount + (next ? 1 : -1) });
    try { const r = await likeTrip(c.tripId, next); onChange({ ...c, ...r }); } catch (e) { onChange(c); o.toast(apiErrorMessage(e, "Like not saved")); }
  };
  return <button type="button" className={"btn btn-sm " + (c.likedByMe ? "btn-danger" : "btn-ghost")} aria-pressed={c.likedByMe} aria-label="Like" disabled={mine} onClick={(e) => { e.stopPropagation(); toggle(); }}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill={c.likedByMe ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS.heart }} />
    <span className="num">{c.likeCount}</span></button>;
}

/** Copy a shared place into one of your trips as a new idea (POST /community/places/{id}/copy). */
function CopyPlace({ p }: { p: CommunityPlace }) {
  const app = useApp(), o = useOverlay(), store = useMaybeTrip();
  const targets = app.trips.filter(editable);
  const [tripId, setTripId] = useState(targets.find((t) => t.tripId === app.lastTripId)?.tripId ?? targets[0]?.tripId), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const copy = async () => {
    if (!tripId) return; setBusy(true);
    try {
      await copyCommunityPlace(p.id, tripId);
      if (store?.trip.tripId === tripId) store.refreshActivities().catch(() => undefined); /* the open trip shows the new idea at once */
      o.closeDialog(); o.toast("Copied to " + targets.find((t) => t.tripId === tripId)?.name); }
    catch (e) { setErr(apiErrorMessage(e, "Could not copy this place")); } finally { setBusy(false); }
  };
  return <div className="dlg-body">
    <DlgHead title={"Copy " + p.name} onClose={o.closeDialog} />
    {!targets.length ? <Empty icon="grid" text="No trip to copy into" /> : <div className="pills" style={{ flexDirection: "column", alignItems: "stretch" }}>{targets.map((t) => <label key={t.tripId}>
      <input type="radio" name="trip" checked={t.tripId === tripId} onChange={() => setTripId(t.tripId)} />
      <span style={{ height: 56, borderRadius: 16, justifyContent: "flex-start" }}><Thumb t={t} size={30} r={9} />{t.name}<small style={{ marginLeft: "auto", fontWeight: 600, opacity: 0.75 }}>{frange(t.startDate, t.endDate)}</small></span></label>)}</div>}
    <FieldErr msg={err} />
    <div className="dlg-foot"><button type="button" className="btn btn-ghost" onClick={o.closeDialog}>Cancel</button><button type="button" className="btn btn-primary" disabled={!tripId || busy} onClick={copy}><Icon n="copy" s={16} />Copy as activity</button></div>
  </div>;
}

/** One shared place: photos, when it was on the trip, where, tags; copy it into one of your trips from here. */
function PlaceDetail({ p, trip }: { p: CommunityPlace; trip: CommunityTrip }) {
  const o = useOverlay();
  const [pi, setPi] = useState(0);
  return <div className="dlg-body">
    <DlgHead title={p.name} onClose={o.closeDialog} />
    <Photo src={p.imageUrls[Math.min(pi, p.imageUrls.length - 1)]} category={p.category} tone={toneOf(p.id)} big />
    {p.imageUrls.length > 1 && <div className="photo-row">{p.imageUrls.map((u, i) => <button key={u} type="button" className="photo-pick" aria-pressed={i === pi} aria-label={"Photo " + (i + 1)} onClick={() => setPi(i)}><PhotoThumb src={u} tone={toneOf(p.id)} size={[64, 48]} /></button>)}</div>}
    <div className="pills"><Chip text={p.category} cls={"cat-" + catKey(p.category)} icon={catIcon(p.category)} /><Chip text={`Day ${dayDiff(trip.startDate, p.date) + 1} · ${fwd(p.date)} ${fd(p.date)}`} icon="cal" /><Chip text={`${hm(p.startTime)}–${hm(p.endTime)}`} icon="clock" /></div>
    {p.location && <div className="addr-row"><Icon n="pin" s={17} /><span>{p.location}</span></div>}
    {p.tags.length > 0 && <div className="pills">{p.tags.map((g) => <Chip key={g} text={"#" + g} />)}</div>}
    <div className="dlg-foot"><button type="button" className="btn btn-ghost" onClick={o.closeDialog}>Close</button><button type="button" className="btn btn-primary" onClick={() => o.dialog(<CopyPlace p={p} />)}><Icon n="copy" s={16} />Copy to my trip</button></div>
  </div>;
}

/** Public comments under a shared trip: anyone signed in can post; the author or a trip owner deletes. */
function Comments({ tripId }: { tripId: number }) {
  const o = useOverlay();
  const load = useLoad(() => fetchCommunityComments(tripId), [tripId], "Couldn't load the comments.");
  const [added, setAdded] = useState<CommunityComment[]>([]), [gone, setGone] = useState<number[]>([]);
  const [text, setText] = useState(""), [busy, setBusy] = useState(false);
  const list = load.data ? [...load.data, ...added].filter((c) => !gone.includes(c.id)) : null;
  const post = async (e: FormEvent) => {
    e.preventDefault(); const c = text.trim(); if (!c || busy) return;
    setBusy(true);
    try { const r = await postCommunityComment(tripId, c); setAdded((l) => [...l, r]); setText(""); }
    catch (ex) { o.toast(apiErrorMessage(ex, "Comment not posted")); } finally { setBusy(false); }
  };
  const drop = async (c: CommunityComment) => {
    try { await deleteCommunityComment(tripId, c.id); setGone((l) => [...l, c.id]); }
    catch (ex) { o.toast(apiErrorMessage(ex, "Comment not deleted")); }
  };
  return <section><h3 style={{ marginBottom: 6 }}>Comments{list && <span className="n num">{list.length}</span>}</h3>
    {load.error && !list && <LoadError compact text={load.error} onRetry={load.retry} />}
    {list?.map((c) => <div key={c.id} className="list-row" style={{ alignItems: "flex-start" }}><Avatar id={c.authorId} name={c.authorName} />
      <span style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{c.authorName}</b> <span className="hint num">{ago(c.createdAt)}</span><span style={{ display: "block", color: "var(--ink-2)", overflowWrap: "anywhere" }}>{c.content}</span></span>
      {c.canDelete && <button type="button" className="icon-btn" aria-label="Delete comment" onClick={() => drop(c)}><Icon n="trash" s={15} /></button>}</div>)}
    <form style={{ display: "flex", gap: 8, marginTop: 8 }} onSubmit={post}><input className="input" maxLength={1000} placeholder="Add a public comment" aria-label="Add a public comment" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="submit" className="round solid" aria-label="Post comment" disabled={busy || !text.trim()}><Icon n="arrow" s={18} /></button></form>
  </section>;
}

function TripDrawer({ c, mine, owner, onChange, onRemoved }: { c: CommunityTrip; mine: boolean; owner: boolean; onChange: (c: CommunityTrip) => void; onRemoved: (id: number) => void }) {
  const o = useOverlay(), app = useApp(), store = useMaybeTrip();
  const [cur, setCur] = useState(c);
  const by: Record<string, CommunityPlace[]> = {};
  cur.places.forEach((p) => { (by[p.date] = by[p.date] ?? []).push(p); });
  const change = (x: CommunityTrip) => { setCur(x); onChange(x); };
  /* Back to ARCHIVED: gone from Community, and the trip's Share button comes back. */
  const unshare = async () => {
    if (!(await o.confirm({ title: "Remove from Community?", body: "It goes back to Archived. You can edit it and share it again from the trip.", label: "Remove", danger: true }))) return;
    try {
      const t = await unpublishTrip(cur.tripId);
      app.putTrip(t); if (store?.trip.tripId === t.tripId) store.setTrip(t);
      onRemoved(cur.tripId); o.closeDrawer(); o.toast("Removed from Community");
    } catch (e) { o.toast(apiErrorMessage(e, "Could not remove this trip")); }
  };
  return <>
    <div className="dlg-head"><span /><button type="button" className="icon-btn" aria-label="Close" onClick={o.closeDrawer}><Icon n="x" s={20} /></button></div>
    <div className={"toned img-head " + toneOf(cur.tripId)} style={{ padding: 22, borderRadius: 20, backgroundImage: `url('${coverOf(cur)}')` }}><div className="kicker">{cur.destination}</div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1.05, marginTop: 4 }}>{cur.name}</div>
      <div className="meta" style={{ color: "inherit", marginTop: 10 }}><Icon n="cal" s={14} />{frange(cur.startDate, cur.endDate)} · {plural(cur.places.length, "place")}</div></div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      {owner && <button type="button" className="btn btn-sm btn-ghost" onClick={unshare}><Icon n="share" s={15} />Remove from Community</button>}
      <Like c={cur} mine={mine} onChange={change} /></div>
    {Object.keys(by).sort().map((d) => <section key={d}><h3>Day {dayDiff(cur.startDate, d) + 1} <span className="muted num" style={{ fontWeight: 600 }}>· {fwd(d)} {fd(d)}</span></h3>
      {by[d].sort((a, b) => (a.startTime < b.startTime ? -1 : 1)).map((p) => <div key={p.id} className="list-row click-row" role="button" tabIndex={0} style={{ alignItems: "flex-start" }}
        onClick={() => o.dialog(<PlaceDetail p={p} trip={cur} />)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) o.dialog(<PlaceDetail p={p} trip={cur} />); }}><span className="num hint" style={{ width: 44, paddingTop: 9 }}>{hm(p.startTime)}</span>
        {p.imageUrls.length ? <span style={{ flex: "none" }}><PhotoThumb src={p.imageUrls[0]} tone={toneOf(p.id)} size={[64, 48]} /></span>
          : <span className={"cat-" + catKey(p.category)} style={{ display: "grid", placeItems: "center", width: 64, height: 48, borderRadius: 12, flex: "none" }}><Icon n={catIcon(p.category)} s={17} /></span>}
        <span style={{ flex: 1, minWidth: 0 }}><b>{p.name}</b><span className="meta one"><span>{p.location}</span></span></span>
        <button type="button" className="icon-btn sm" aria-label={"Copy " + p.name} title="Copy to my trip" onClick={(e) => { e.stopPropagation(); o.dialog(<CopyPlace p={p} />); }}><Icon n="copy" s={16} /></button></div>)}</section>)}
    {!cur.places.length && <Empty icon="pin" text="No shared places" />}
    <Comments tripId={cur.tripId} />
  </>;
}

/** Published trips from everyone: places and times only (members, money and comments stay private). */
export default function Community() {
  const app = useApp(), o = useOverlay();
  const [list, setList] = useState<CommunityTrip[] | null>(null), [err, setErr] = useState("");
  /* The backend sends 20 shared trips per page; a full page means there may be more. */
  const [page, setPage] = useState(0), [more, setMore] = useState(false), [busy, setBusy] = useState(false);
  const [q, setQ] = useState(""), [sort, setSort] = useState<"popular" | "new">("popular");
  useEffect(() => {
    let live = true;
    fetchCommunityTrips(page).then((batch) => {
      if (!live) return;
      setList((l) => page === 0 ? batch : [...(l ?? []), ...batch.filter((c) => !l?.some((x) => x.tripId === c.tripId))]);
      setMore(batch.length >= PAGE_SIZE);
    }).catch((e) => { if (live) setErr(apiErrorMessage(e, "Could not load Community")); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [page]);
  const mine = (id: number) => app.trips.some((t) => t.tripId === id);
  const owns = (id: number) => app.trips.some((t) => t.tripId === id && isOwner(t));
  const drop = (id: number) => setList((l) => l?.filter((x) => x.tripId !== id) ?? l);
  const put = (c: CommunityTrip) => setList((l) => l?.map((x) => (x.tripId === c.tripId ? c : x)) ?? l);
  const query = q.trim().toLowerCase();
  const shown = (list ?? []).map((c, i) => ({ c, i })).filter(({ c }) => !query || (c.name + " " + c.destination).toLowerCase().includes(query))
    .sort((a, b) => (sort === "popular" ? b.c.likeCount - a.c.likeCount : a.i - b.i));
  return <>
    <div className="sec-head"><h1>Community{list && <span className="n num">{list.length}</span>}</h1></div>
    <div className="sec-head" data-tour="community-tools">
      <Seg name="commSort" value={sort} onChange={setSort} options={[["popular", "Popular"], ["new", "Newest"]]} />
      <label className="search" style={{ flex: "0 1 280px", background: "var(--card)" }}><Icon n="search" s={17} /><span className="sr">Search community</span><input type="search" placeholder="City or trip" value={q} onChange={(e) => setQ(e.target.value)} /></label>
    </div>
    {err ? <section className="card"><Empty icon="alert" text={err} /></section> : !list ? <div className="empty"><Spinner /></div>
      : shown.length ? <div className="grid">{shown.map(({ c }) => { const own = mine(c.tripId);
        return <article key={c.tripId} className={"card tcard spot " + toneOf(c.tripId)} tabIndex={0} role="button" aria-label={c.name} onClick={() => o.drawer(<TripDrawer c={c} mine={own} owner={owns(c.tripId)} onChange={put} onRemoved={drop} />, { modal: true })} onKeyDown={(e) => { if (e.key === "Enter") o.drawer(<TripDrawer c={c} mine={own} owner={owns(c.tripId)} onChange={put} onRemoved={drop} />, { modal: true }); }}>
          <div className="tcard-media img" style={{ backgroundImage: `linear-gradient(to top, rgba(12,16,28,.55), rgba(12,16,28,0) 60%),url('${coverOf(c)}')` }}><span className="chips">{own && <Chip text="Yours" cls="c-violet" />}</span>{c.destination.split(",")[0]}</div>
          <div className="tcard-body"><h3>{c.name}</h3>
            <div className="tcard-foot"><div className="meta"><Icon n="pin" s={14} />{plural(c.places.length, "place")} · {MON[pd(c.startDate).getMonth()]} {pd(c.startDate).getFullYear()}</div><Like c={c} mine={own} onChange={put} /></div></div></article>; })}</div>
      : <Empty icon="globe" text={list.length ? "No shared trips match" : "Nothing shared yet"} />}
    {list && more && !err && <div className="load-more"><button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setBusy(true); setPage((p) => p + 1); }}>
      {busy ? <Spinner s={16} /> : <Icon n="chev" s={16} />}Show more</button></div>}
  </>;
}

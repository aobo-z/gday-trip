import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useReviewBadge } from "../lib/reviewBadge";
import { useLocation, useNavigate } from "react-router-dom";
import { respondToInvitation } from "../api/tripApi";
import { expenseApi, type Expense } from "../api/expenseApi";
import { apiErrorMessage } from "../api/apiError";
import { useApp, useMaybeTrip, useSession } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { Avatar, Chip, Empty, Icon, LoadError } from "../ui/kit";
import { useSlide } from "../ui/slide";
import { STATUS, activeTrips, catIcon, chipOf, coverOf, ideaKind, isScheduled, editable } from "../lib/domain";
import { fd, frange, fwd, hm, money, pd } from "../lib/format";
import { THEMES, THEME_KEYS } from "../lib/theme";
import TripForm from "./TripForm";
import JoinCode from "./JoinCode";
import Tour from "./Tour";
import { TOURS, tipsConfig } from "../lib/tours";
import { usePeek } from "./usePeek";

const NAV: [string, [string, string, string][]][] = [
  ["Trip", [["overview", "Overview", "home"], ["vote", "Vote", "vote"], ["schedule", "Schedule", "cal"], ["map", "Map", "map"], ["expenses", "Expenses", "wallet"]]],
  ["Explore", [["trips", "All trips", "grid"], ["ai", "AI planner", "sparkle"], ["community", "Community", "globe"]]],
  ["You", [["reviews", "Reviews", "star"], ["profile", "Profile", "user"], ["settings", "Settings", "gear"]]],
];
const TRIP_TABS = new Set(["overview", "vote", "schedule", "map", "expenses"]);

export function Thumb({ t, size, r }: { t: { tripId?: number; destination?: string; coverImageId?: string | null }; size: number; r: number }) {
  return <span className="thumb" style={{ width: size, height: size, borderRadius: r, backgroundImage: `url('${coverOf(t)}')` }} />;
}

function Sidebar({ tab }: { tab: string }) {
  const nav = useNavigate(), store = useMaybeTrip(), app = useApp(), o = useOverlay();
  const needs = store && editable(store.trip) ? store.activities.filter((a) => ideaKind(a) === "needs").length : 0;
  const reviews = useReviewBadge(app.trips);
  const box = useSlide("nav", [tab], false);
  const go = (v: string) => nav(TRIP_TABS.has(v) ? (store ? `/trip/${store.trip.tripId}/${v}` : "/trips") : "/" + v);
  return <aside className="side card">
    <a className="brand" href="/" onClick={(e) => { e.preventDefault(); go("overview"); }}>G’Day Trip</a>
    <button type="button" className="btn btn-primary btn-block new-trip" onClick={() => o.dialog(<TripForm />)}><Icon n="plus" />New trip</button>
    <nav className="nav" aria-label="Main" ref={box}>
      {NAV.map(([label, items]) => <div key={label} style={{ display: "contents" }}>
        <div className="nav-label">{label}</div>
        {items.map(([v, text, icon]) => {
          const badge = v === "vote" ? needs : v === "reviews" ? reviews : v === "trips" ? app.invitations.length : 0;
          return <button key={v} type="button" aria-current={tab === v ? "page" : undefined} disabled={TRIP_TABS.has(v) && !store} onClick={() => go(v)}>
            <Icon n={icon} s={20} />{text}{badge > 0 && <span className="badge num">{badge}</span>}</button>;
        })}
      </div>)}
    </nav>
  </aside>;
}

interface Hit { key: string; icon: string; title: string; sub?: string; right: string; run: () => void }
function mark(text: string | null | undefined, q: string) {
  const s = text ?? "", i = q ? s.toLowerCase().indexOf(q) : -1;
  return i < 0 ? s : <>{s.slice(0, i)}<mark>{s.slice(i, i + q.length)}</mark>{s.slice(i + q.length)}</>;
}

/* Top-bar search. There is no search endpoint, so the trip's plans (already loaded) and expenses
   (fetched on first focus) are filtered here together with the trip list. */
function Search({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const store = useMaybeTrip(), app = useApp(), nav = useNavigate(), peek = usePeek();
  const [q, setQ] = useState(""), [idx, setIdx] = useState(0);
  const [expenses, setExpenses] = useState<{ tripId: number; list: Expense[] } | null>(null);
  const tripId = store?.trip.tripId;
  /* Fetched each time the search box gets focus, so expenses added since the last search are found too. */
  const ensure = () => { if (tripId) expenseApi.list(tripId).then((list) => setExpenses({ tripId, list })).catch(() => setExpenses((e) => e?.tripId === tripId ? e : { tripId, list: [] })); };
  const query = q.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!query) return [];
    const plans: Hit[] = [], exps: Hit[] = [], trips: Hit[] = [];
    store?.activities.forEach((a) => {
      if (![a.name, a.location, a.category, a.description, a.tags.join(" ")].join(" ").toLowerCase().includes(query)) return;
      const tag = a.tags.find((g) => g.toLowerCase().includes(query));
      plans.push({ key: "a" + a.id, icon: a.branch ? "branch" : catIcon(a.category), title: a.name, sub: tag && !a.name.toLowerCase().includes(query) ? "#" + tag : a.location,
        right: isScheduled(a) ? fwd(a.date!) + " " + pd(a.date!).getDate() + " · " + hm(a.startTime) : chipOf(a)[0],
        run: () => isScheduled(a) ? peek.plan(a.id) : peek.idea(a.id) });
    });
    if (expenses && expenses.tripId === tripId) expenses.list.forEach((e) => {
      if (!(e.description + " " + (e.category ?? "")).toLowerCase().includes(query)) return;
      exps.push({ key: "e" + e.expenseId, icon: "receipt", title: e.description, sub: fd(e.date) + " · " + e.payerName, right: money(e.originalAmount ?? e.amount, e.currencyCode ?? e.baseCurrency),
        run: () => nav(`/trip/${e.tripId}/expenses`, { state: { expense: e.expenseId } }) });
    });
    app.trips.forEach((t) => {
      if (t.tripId === tripId || !(t.name + " " + t.destination).toLowerCase().includes(query)) return;
      trips.push({ key: "t" + t.tripId, icon: "grid", title: t.name, sub: t.destination, right: STATUS[t.status]?.[0] ?? t.status, run: () => nav(`/trip/${t.tripId}/overview`) });
    });
    return ([["Plans", "cal", plans.slice(0, 6)], ["Expenses", "receipt", exps.slice(0, 4)], ["Trips", "grid", trips.slice(0, 3)]] as [string, string, Hit[]][]).filter((g) => g[2].length);
  }, [query, store, expenses, tripId, app.trips, nav, peek]);
  const flat = groups.flatMap((g) => g[2]);
  const pick = (h: Hit) => { setOpen(false); setQ(""); h.run(); };
  let k = 0;
  return <label className="search pop-wrap"><Icon n="search" s={18} /><span className="sr">Search</span>
    <input type="search" placeholder="Search plans, expenses, trips" autoComplete="off" value={q}
      onFocus={() => { ensure(); if (q) setOpen(true); }}
      onChange={(e) => { setQ(e.target.value); setIdx(0); setOpen(!!e.target.value); }}
      onKeyDown={(e) => {
        if (!flat.length) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length); }
        else if (e.key === "Enter") { e.preventDefault(); pick(flat[Math.min(idx, flat.length - 1)]); }
      }} />
    {open && query && <div className="pop search-pop" role="listbox">
      {!flat.length ? <div className="empty" style={{ padding: 20 }}><Icon n="search" s={22} /><span>No matches</span></div>
        : groups.map(([label, icon, hits]) => <div key={label}>
          <div className="search-group"><Icon n={icon} s={13} />{label}<span className="num">{hits.length}</span></div>
          {hits.map((h) => { const i = k++; return <button key={h.key} type="button" className={"opt" + (i === idx ? " active" : "")} role="option" aria-selected={i === idx} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)}>
            <Icon n={h.icon} /><span className="so-main"><span className="so-title">{mark(h.title, query)}</span>{h.sub && <small>{mark(h.sub, query)}</small>}</span><small className="so-right num">{h.right}</small></button>; })}
        </div>)}
    </div>}
  </label>;
}

function TopBar({ onHelp, canHelp }: { onHelp: () => void; canHelp: boolean }) {
  const store = useMaybeTrip(), app = useApp(), { user, signOut, setTheme } = useSession(), nav = useNavigate(), o = useOverlay();
  const [pop, setPop] = useState<"" | "trips" | "search" | "bell" | "me">("");
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => { if (!(e.target as Element).closest(".pop-wrap")) setPop(""); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPop(""); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, []);
  const respond = async (memberId: number, tripId: number, action: "ACCEPT" | "REJECT") => {
    try {
      await respondToInvitation(memberId, action);
      await Promise.all([app.refreshInvitations(), app.refreshTrips()]);
      setPop("");
      if (action === "ACCEPT") { o.toast("Joined"); nav(`/trip/${tripId}/overview`); }
    } catch (e) { o.toast(apiErrorMessage(e, "Could not answer the invitation")); }
  };
  const t = store?.trip, switchable = activeTrips(app.trips);
  /* The trip switcher belongs to the trip pages; elsewhere the bar starts with search. */
  const path = useLocation().pathname, onTrip = path.startsWith("/trip/") && !!t;
  /* Switching trips keeps you on the same page (Vote stays Vote), not back to Overview. */
  const page = path.split("/")[3], here = TRIP_TABS.has(page) ? page : "overview";
  return <header className="top" ref={bar}>
    {onTrip && t && <div className="pop-wrap">
      <button type="button" className="trip-btn" aria-haspopup="true" aria-expanded={pop === "trips"} onClick={() => setPop(pop === "trips" ? "" : "trips")}>
        <Thumb t={t} size={34} r={10} /><span className="trip-btn-text"><b>{t.name}</b><small>{t.destination.split(",")[0]} · {frange(t.startDate, t.endDate)}</small></span><Icon n="chev" s={16} /></button>
      {pop === "trips" && <div className="pop trip-menu" role="menu">
        {switchable.map((x) => <button key={x.tripId} type="button" className="opt" role="menuitemradio" aria-checked={x.tripId === t?.tripId}
          onClick={() => { setPop(""); nav(`/trip/${x.tripId}/${here}`); }}>
          <Thumb t={x} size={30} r={9} /><span className="trip-menu-text">{x.name}<small>{x.destination.split(",")[0]} · {frange(x.startDate, x.endDate)}</small></span>
          <Chip text={STATUS[x.status]?.[0] ?? x.status} cls={STATUS[x.status]?.[1]} /></button>)}
        {switchable.length > 0 && <hr />}
        <button type="button" className="opt" onClick={() => { setPop(""); nav("/trips"); }}><Icon n="grid" />All trips</button>
        <button type="button" className="opt" onClick={() => { setPop(""); o.dialog(<JoinCode />); }}><Icon n="door" />Join with code</button>
      </div>}
    </div>}
    <Search open={pop === "search"} setOpen={(v) => setPop(v ? "search" : "")} />
    {canHelp && <button type="button" className="icon-btn" data-tour="help" aria-label="Tips for this page" title="Tips for this page" onClick={onHelp}><Icon n="help" s={20} /></button>}
    <div className="pop-wrap bell">
      <button type="button" className="icon-btn" aria-label="Notifications" aria-expanded={pop === "bell"} onClick={() => setPop(pop === "bell" ? "" : "bell")}><Icon n="bell" s={20} /></button>
      {app.invitations.length > 0 && <span className="dot" />}
      {pop === "bell" && <div className="pop right" style={{ minWidth: 340, padding: "6px 8px" }}>
        {app.invitations.length ? <>
          <div className="search-group"><Icon n="mail" s={13} />Invitations<span className="num">{app.invitations.length}</span></div>
          {app.invitations.map((i) => <div key={i.tripMemberId} className="list-row" style={{ padding: "10px 8px" }}>
            <Thumb t={{ tripId: i.tripId, destination: i.tripDestination }} size={36} r={11} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{i.tripName}<small style={{ display: "block", fontWeight: 500 }} className="muted">{i.tripDestination}</small></span>
            <button type="button" className="icon-btn sm" aria-label="Decline" onClick={() => respond(i.tripMemberId, i.tripId, "REJECT")}><Icon n="x" s={17} /></button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => respond(i.tripMemberId, i.tripId, "ACCEPT")}>Join</button>
          </div>)}
        </> : app.invitationsFailed ? <LoadError compact text="Couldn't check for invitations." onRetry={() => { app.refreshInvitations(); }} /> : <Empty icon="bell" text="All caught up" />}
      </div>}
    </div>
    <div className="pop-wrap">
      <button type="button" className="me-btn" aria-expanded={pop === "me"} onClick={() => setPop(pop === "me" ? "" : "me")} title={user?.username}><span className="me-name">{user?.username}</span>{user && <Avatar id={user.userId} name={user.username} />}</button>
      {pop === "me" && <div className="pop right" role="menu">
        <div className="swatches">{THEME_KEYS.map((k) => { const b = THEMES[k].brand; return <button key={k} type="button" aria-pressed={user?.accentColor === k} aria-label={THEMES[k].label + " theme"} title={THEMES[k].label}
          style={{ background: `conic-gradient(from 200deg,${b[0]},${b[1]},${b[2]},${b[0]})` }} onClick={(e) => { setTheme(k, e.clientX, e.clientY).catch(() => o.toast("Theme not saved")); }} />; })}</div><hr />
        <button type="button" className="opt" onClick={() => { setPop(""); nav("/profile"); }}><Icon n="user" />Profile</button>
        <button type="button" className="opt" onClick={() => { setPop(""); nav("/settings"); }}><Icon n="gear" />Settings</button><hr />
        <button type="button" className="opt danger" onClick={() => { signOut(); nav("/login"); }}><Icon n="logout" />Sign out</button>
      </div>}
    </div>
  </header>;
}

/* Tips are shown once per page per account; the ? button replays them. Tests (MODE "test") start them only by the button. */
const seenKey = (userId: number, tab: string) => `gday-tips:${userId}:${tab}`;
function tipsSeen(userId: number, tab: string) { try { return localStorage.getItem(seenKey(userId, tab)) === "1"; } catch { return true; } }
function markTipsSeen(userId: number, tab: string) { try { localStorage.setItem(seenKey(userId, tab), "1"); } catch { /* storage off */ } }

export default function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation(), store = useMaybeTrip(), app = useApp(), { user } = useSession();
  const [tour, setTour] = useState<string | null>(null);
  const seg = loc.pathname.split("/").filter(Boolean);
  const tab = seg[0] === "trip" ? seg[2] ?? "overview" : seg[0] ?? "overview";
  const tripId = store?.trip.tripId;
  useEffect(() => { if (tripId && seg[0] === "trip") app.setLastTripId(tripId); }, [tripId, seg[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  /* A new page starts at the top, not at the previous page's scroll position, and with fresh data. */
  useEffect(() => { window.scrollTo(0, 0); app.revalidate(); store?.revalidate(); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const userId = user?.userId;
  /* The automatic start is a pending timer. Opening or closing the tips by hand cancels it, and when it fires it
     checks again, so tips just closed with Done or Skip can't pop straight back up. */
  const autoTimer = useRef(0);
  useEffect(() => {
    if (!tipsConfig.auto || !userId || !TOURS[tab] || tipsSeen(userId, tab)) return;
    /* Wait for the page (loaded on demand) to draw, and never cover an open dialog. */
    autoTimer.current = window.setTimeout(() => { if (!tipsSeen(userId, tab) && !document.querySelector("dialog[open]")) setTour(tab); }, tipsConfig.delay);
    return () => clearTimeout(autoTimer.current);
  }, [tab, userId]);
  const startTour = () => { clearTimeout(autoTimer.current); setTour(tab); };
  const endTour = useCallback(() => { clearTimeout(autoTimer.current); if (userId) markTipsSeen(userId, tab); setTour(null); }, [userId, tab]);
  return <div className="app">
    <Sidebar tab={tab} />
    <div className="page">
      <TopBar onHelp={startTour} canHelp={!!TOURS[tab]} />
      {/* Keys are prefixed: as siblings, a tour keyed "trips" and the Trips page keyed "trips" would collide, and React
          would then remove the wrong one (the tips stayed on screen after Done or Skip). */}
      {tour === tab && TOURS[tab] && <Tour key={"tour-" + tab} steps={TOURS[tab]} onDone={endTour} />}
      <main className="view" key={"view-" + tab + (seg[0] === "trip" ? tripId : "")}>{children}</main>
    </div>
  </div>;
}

export function ShellLoading() {
  return <div className="app"><aside className="side card"><span className="brand">G’Day Trip</span></aside><div className="page"><header className="top" /><main className="view"><div className="card pad sk-block" /><div className="card pad sk-block" /></main></div></div>;
}
/** Placeholder in the content area while a page's code is fetched. */
export function PageLoading() {
  return <div className="page-loading" aria-busy="true"><div className="card pad sk-block" /><div className="card pad sk-block" /></div>;
}
export function ShellMessage({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return <section className="card"><Empty icon="alert" text={msg}>{onRetry && <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}><Icon n="refresh" s={15} />Retry</button>}</Empty></section>;
}

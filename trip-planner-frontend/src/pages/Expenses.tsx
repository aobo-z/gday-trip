import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { expenseApi, expenseError, type Budget, type Expense, type ExpenseSummary, type PersonalBudget } from "../api/expenseApi";
import { useMe, useTrip } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { DlgHead } from "../ui/Overlay";
import { Avatar, Chip, CountUp, Empty, FieldErr, Icon, Seg } from "../ui/kit";
import Select from "../ui/Select";
import { editable } from "../lib/domain";
import { CURRENCIES, cents, fd, fdy, money, r2, sum } from "../lib/format";
import { EXP_CATS, EXP_ICON, catColor, expCategory, shareLabel, type Money } from "../lib/expense";
import ExpenseForm from "../parts/ExpenseForm";
import ExpenseBalances from "../parts/ExpenseBalances";
import { usePeek } from "../parts/usePeek";
import FilePreview from "../parts/FilePreview";

interface Data { expenses: Expense[]; budget: Budget; summary: ExpenseSummary; personal: PersonalBudget | null }
interface Filters { query: string; category: string; payer: string; from: string; to: string }

function Person({ id, name }: { id: number; name: string }) { const peek = usePeek(); return <span className="ex-person"><Avatar id={id} name={name} onClick={() => peek.person(id, name)} />{name}</span>; }

/** Spending by category as a ring: hover, focus or tap a slice or a row and it steps out with the exact values. */
function Analytics({ expenses, personal, m }: { expenses: Expense[]; personal: boolean; m: Money }) {
  const rows = useMemo(() => {
    const tot: Record<string, number> = {}; let all = 0;
    EXP_CATS.forEach((c) => { tot[c] = 0; });
    expenses.forEach((e) => { const c = Math.round((personal ? e.currentUserShare : e.amount) * 100), k = expCategory(e.category); tot[k] = (tot[k] ?? 0) + c; all += c; });
    return Object.entries(tot).map(([category, c]) => ({ category, amount: c / 100, pct: all ? c / all * 100 : 0 }));
  }, [expenses, personal]);
  const segs: { category: string; pct: number; off: number }[] = []; let off = 0;
  rows.forEach((r) => { if (r.pct > 0) { segs.push({ category: r.category, pct: r.pct, off }); off += r.pct; } });
  const [cur, setCur] = useState<{ cat: string; how: "hover" | "focus" | "tap" } | null>(null);
  const card = useRef<HTMLElement>(null), tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = (e: PointerEvent) => { if (!(e.target as Element).closest?.("[data-inspect]")) setCur(null); };
    document.addEventListener("pointerdown", out); return () => document.removeEventListener("pointerdown", out);
  }, []);
  const active = cur && segs.find((s) => s.category === cur.cat), row = cur && rows.find((r) => r.category === cur.cat);
  const mid = (s: { off: number; pct: number }) => (s.off + s.pct / 2) * Math.PI / 50 - Math.PI / 2;
  useEffect(() => {
    const c = card.current, t = tip.current; if (!c || !t || !cur) return;
    const cb = c.getBoundingClientRect(), svg = c.querySelector(".ex-donut"); let x: number, y: number;
    if (svg && active) { const sb = svg.getBoundingClientRect(), a = mid(active); x = sb.left + sb.width * (110 + 100 * Math.cos(a)) / 220; y = sb.top + sb.height * (110 + 100 * Math.sin(a)) / 220; }
    else { const b = c.querySelector(`[data-row="${CSS.escape(cur.cat)}"] button`)?.getBoundingClientRect(); if (!b) return; x = b.left + b.width / 2; y = b.top; }
    const w = t.offsetWidth, h = t.offsetHeight, top = y - h - 12 >= cb.top + 8 ? y - h - 12 : y + 18;
    t.style.left = Math.max(8, Math.min(x - w / 2 - cb.left, cb.width - w - 8)) + "px"; t.style.top = Math.max(8, Math.min(top - cb.top, cb.height - h - 8)) + "px";
  });
  const inspect = (cat: string) => ({
    "data-inspect": cat,
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType !== "touch") setCur({ cat, how: "hover" }); },
    onPointerLeave: () => setCur((c) => (c?.how === "hover" && c.cat === cat ? null : c)),
    onFocus: () => setCur({ cat, how: "focus" }),
    onBlur: () => setCur((c) => (c?.how !== "hover" && c?.cat === cat ? null : c)),
    onClick: () => setCur((c) => (c?.how === "tap" && c.cat === cat ? null : { cat, how: "tap" })),
  });
  const ring = (s: { pct: number; off: number }) => ({ cx: 110, cy: 110, r: 84, fill: "none", strokeWidth: 32, pathLength: 100, strokeDasharray: `${s.pct} ${100 - s.pct}`, strokeDashoffset: -s.off, transform: "rotate(-90 110 110)" });
  const ordered = [...segs].sort((a, b) => Number(a.category === cur?.cat) - Number(b.category === cur?.cat));
  return <section className="card pad ex-cats" ref={card} onKeyDown={(e) => { if (e.key === "Escape") setCur(null); }}>
    <h3>{personal ? "My share by category" : "Spending by Category"}</h3>
    <div className="ex-cat-layout">
      {segs.length > 6 ? <svg className="ex-stacked" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">{segs.map((s) => <rect key={s.category} x={s.off} y={0} width={s.pct} height={12} fill={catColor(s.category)} />)}</svg>
        : <svg className="ex-donut" viewBox="0 0 220 220" role="group" aria-label="Explore category spending">
          <circle className="ex-track" cx="110" cy="110" r="84" fill="none" strokeWidth="32" />
          {ordered.map((s) => { const on = s.category === cur?.cat, a = mid(s); return <g key={s.category} className="ex-seg" style={{ transform: on ? `translate(${(7 * Math.cos(a)).toFixed(2)}px,${(7 * Math.sin(a)).toFixed(2)}px)` : undefined }}><circle {...ring(s)} stroke={catColor(s.category)} /></g>; })}
          {segs.map((s) => <circle key={"h" + s.category} className="ex-hit" {...ring(s)} stroke="transparent" tabIndex={0} role="button" aria-label={s.category} {...inspect(s.category)} />)}
          {!segs.length && <text x="110" y="116" textAnchor="middle" className="ex-donut-empty">—</text>}
        </svg>}
      <div className="ex-break">
        {!segs.length && <p className="hint">{personal ? "No spending allocated to you yet." : "No spending yet."}</p>}
        <div className="ex-break-head"><span>Category</span><span>Amount</span><span>Share</span></div>
        <ul>{rows.map((r) => <li key={r.category} data-row={r.category} className={r.category === cur?.cat ? "on" : ""}>
          <button type="button" {...inspect(r.category)}><i style={{ background: catColor(r.category) }} />{r.category}</button><span className="num">{m(r.amount)}</span><span className="num muted">{shareLabel(r.pct)}</span></li>)}</ul>
      </div>
    </div>
    {cur && row && <div className="ex-tip" role="tooltip" ref={tip}><b>{row.category}</b><span className="num">Amount: {m(row.amount)}</span><span className="num">Share: {shareLabel(row.pct)}</span></div>}
  </section>;
}

function Detail({ e, onEdit, onDeleted, onChanged }: { e: Expense; onEdit: () => void; onDeleted: () => void; onChanged: () => void }) {
  const o = useOverlay(), { trip, activities } = useTrip();
  const fx = e.currencyCode !== e.baseCurrency, linked = e.activityId ? activities.find((a) => a.id === e.activityId) : undefined;
  const remove = async () => {
    if (!(await o.confirm({ title: `Delete “${e.description}”?`, body: "This cannot be undone.", label: "Delete", danger: true }))) { o.dialog(<Detail e={e} onEdit={onEdit} onDeleted={onDeleted} onChanged={onChanged} />); return; }
    try { await expenseApi.remove(trip.tripId, e.expenseId); onDeleted(); o.toast("Expense deleted"); } catch (ex) { o.toast(expenseError(ex)); }
  };
  /* The confirm takes this window's place, so the detail comes back either way (without the receipt once it's gone). */
  const dropReceipt = async () => {
    const back = (x: Expense) => o.dialog(<Detail e={x} onEdit={onEdit} onDeleted={onDeleted} onChanged={onChanged} />);
    if (!(await o.confirm({ title: "Delete this receipt?", body: "The expense stays; only the attached file is removed.", label: "Delete", danger: true }))) return back(e);
    try { await expenseApi.removeReceipt(trip.tripId, e.expenseId); o.toast("Receipt deleted"); back({ ...e, receipt: null }); onChanged(); }
    catch (ex) { o.toast(expenseError(ex)); back(e); }
  };
  return <div className="dlg-body">
    <DlgHead title={e.description} onClose={o.closeDialog} />
    <div className="meta"><Icon n="cal" s={14} /><span className="num">{fdy(e.date)}</span> · <Chip text={expCategory(e.category)} icon={EXP_ICON[expCategory(e.category)] ?? "receipt"} /></div>
    <div><div className="stat-value num">{money(e.originalAmount ?? e.amount, e.currencyCode ?? e.baseCurrency)}</div>
      {fx && <div className="hint num" style={{ marginTop: 6 }}>{money(e.amount, e.baseCurrency)} · rate {e.exchangeRateToBase} on {fd(e.exchangeRateDate)}</div>}</div>
    <div><div className="kv"><span>Paid by</span><span><Person id={e.payerId} name={e.payerName} /></span></div><div className="kv"><span>Created by</span><span><Person id={e.createdById} name={e.createdByName} /></span></div>
      <div className="kv"><span>Split</span><span>{{ EQUAL: "Equal", CUSTOM: "Custom", BY_ITEM: "By Item" }[e.splitMode ?? "EQUAL"]}</span></div>
      {e.activityId && <div className="kv"><span>Related Activity</span><span>{e.activityName ?? linked?.name} · {e.activityDate ? fd(e.activityDate) : "Unscheduled"}</span></div>}</div>
    <section><h3 style={{ marginBottom: 4 }}>Participants<span className="n num">{e.shares.length}</span></h3>
      {e.shares.length ? e.shares.map((s) => <div key={s.userId} className="list-row"><span style={{ flex: 1, fontWeight: 700 }}><Person id={s.userId} name={s.username} /></span><b className="num">{money(s.shareAmount, e.baseCurrency)}</b></div>)
        : <p className="hint">This expense has no split yet. Edit it to allocate shares.</p>}</section>
    {e.splitMode === "BY_ITEM" && <section><h3 style={{ marginBottom: 4 }}>Item split</h3>{e.items.map((it, i) => <div key={it.id ?? i} className="ex-item-split">
      <div className="kv"><span>{it.name}{it.quantity ? ` × ${it.quantity}` : ""}</span><span className="num">{money(it.amount * (it.quantity ?? 1), e.currencyCode)}</span></div>
      {it.allocations.map((al) => <div key={al.userId} className="kv sub"><span>{al.username}</span><span className="num">{money(al.shareAmount, e.currencyCode)}</span></div>)}</div>)}</section>}
    {e.receipt && <section><div className="sec-head"><h3>Receipt</h3>
      {e.canEdit && editable(trip) && <button type="button" className="btn btn-ghost btn-sm" onClick={dropReceipt}><Icon n="trash" s={15} />Delete</button>}</div>
      <p className="hint">{e.receipt.fileName} · uploaded by {e.receipt.uploadedBy}</p><FilePreview load={() => expenseApi.receipt(e.tripId, e.expenseId)} type={e.receipt.contentType} name={e.receipt.fileName} label="View receipt" /></section>}
    {e.canEdit && editable(trip) && <div className="dlg-foot"><button type="button" className="btn btn-danger" style={{ marginRight: "auto" }} onClick={remove}><Icon n="trash" s={16} />Delete expense</button>
      <button type="button" className="btn btn-outline" onClick={onEdit}><Icon n="edit" s={16} />Edit expense</button></div>}
  </div>;
}

function BudgetCard({ personal, data, m, reload }: { personal: boolean; data: Data; m: Money; reload: () => void }) {
  const { trip } = useTrip(), o = useOverlay();
  const [editing, setEditing] = useState(false), [amount, setAmount] = useState(""), [cur, setCur] = useState(trip.baseCurrency), [err, setErr] = useState("");
  const pb = data.personal;
  const canEdit = personal ? editable(trip) : data.budget.canEdit;
  const save = async () => {
    const c = cents(amount);
    if (c == null) return setErr("Enter 0 or more, with at most two decimal places.");
    if (c > 9999999999) return setErr("Enter 99,999,999.99 or less.");
    try { if (personal) await expenseApi.savePersonalBudget(trip.tripId, amount, cur); else await expenseApi.updateBudget(trip.tripId, amount); setEditing(false); reload(); o.toast(personal ? "Personal budget saved" : "Budget saved"); }
    catch (ex) { setErr(expenseError(ex)); }
  };
  return <section className="stat card">
    <div className="stat-label">{personal ? "Personal budget" : "Trip budget"}
      {!editing && canEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAmount(personal ? String(pb?.amount ?? "") : String(data.budget.plannedBudget)); setCur(pb?.currencyCode ?? trip.baseCurrency); setErr(""); setEditing(true); }}>{personal && !pb ? "Set budget" : "Edit"}</button>}</div>
    {editing ? <form className="ex-inline" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
      <input className="input num" type="number" min="0" max="99999999.99" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={personal ? "Personal budget amount" : `Trip budget (${trip.baseCurrency})`} autoFocus />
      {personal ? <select className="input" value={cur} onChange={(e) => setCur(e.target.value)} aria-label="Personal budget currency">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select> : <span className="hint">{trip.baseCurrency}</span>}
      <button className="btn btn-primary btn-sm">Save</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button><FieldErr msg={err} />
    </form> : <><div className="stat-value num">{personal ? (pb ? m(pb.baseAmount) : "—") : m(data.budget.plannedBudget)}</div>
      {personal && pb && pb.currencyCode !== trip.baseCurrency && <small className="hint num">{money(pb.amount, pb.currencyCode)}</small>}</>}
  </section>;
}

function Track({ data, m, cur, reload, openDetail, onAdd, personal, setPersonal, f, setF }: { data: Data; m: Money; cur: string; reload: () => void; openDetail: (e: Expense) => void; onAdd: () => void; personal: boolean; setPersonal: (v: boolean) => void; f: Filters; setF: (v: Filters) => void }) {
  const { trip, people } = useTrip(), me = useMe();
  const list = personal ? data.expenses.filter((e) => e.shares.some((s) => s.userId === me.userId)) : data.expenses;
  const spending = personal ? r2(sum(list.map((e) => e.currentUserShare))) : data.summary.totalSpending;
  const budget = personal ? (data.personal ? data.personal.baseAmount : null) : data.summary.budget;
  const remaining = budget == null ? null : (Math.round(budget * 100) - Math.round(spending * 100)) / 100;
  const pct = budget == null || budget <= 0 ? null : Math.round(spending / budget * 10000) / 100;
  const state = remaining != null && remaining < 0 ? " over" : pct != null && pct >= 80 ? " near" : "";
  const bad = !!f.from && !!f.to && f.from > f.to, q = f.query.trim().toLowerCase();
  const rows = list.filter((e) => [e.description, e.payerName, expCategory(e.category)].some((v) => v.toLowerCase().includes(q))
    && (!f.category || expCategory(e.category) === f.category) && (!f.payer || String(e.payerId) === f.payer) && (!f.from || e.date >= f.from) && (!f.to || e.date <= f.to))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.expenseId - a.expenseId));
  const payers = [...new Map([...data.expenses.map((e) => [e.payerId, e.payerName] as const), ...people.map((p) => [p.id, p.name] as const)])].sort((a, b) => a[1].localeCompare(b[1]));
  const cats = [...new Set([...EXP_CATS, ...data.expenses.map((e) => expCategory(e.category))])];
  const card = (label: string, value: number | null, tone = "", note = "", k = "") => <section className="stat card"><div className="stat-label">{label}</div>
    <div className={"stat-value num " + tone}>{value == null ? "—" : <CountUp value={value} k={k + cur} format={m} />}</div>{note && <small className="hint">{note}</small>}</section>;
  return <>
    <div><Seg name="expScope" value={personal ? "personal" : "trip"} onChange={(v) => setPersonal(v === "personal")} options={[["trip", "Trip"], ["personal", "Personal"]]} /></div>
    <div className="stats ex-sum">
      {card(personal ? "My share" : "Total spending", spending, "", "", "ex-spend-" + personal)}
      <BudgetCard key={String(personal)} personal={personal} data={data} m={m} reload={reload} />
      {card("Remaining", remaining, remaining == null ? "" : remaining < 0 ? "owe" : "owed", remaining == null ? "Set your personal budget" : "", "ex-left-" + personal)}
      {card("You owe", data.summary.currentUserOwes, "owe", "", "ex-owe")}
    </div>
    <section className={"card pad ex-prog" + state}><div className="ex-prog-head"><span className="stat-label">{personal ? "Personal budget used" : "Budget used"}</span><b className="num">{pct == null ? "—" : pct + "%"}</b></div>
      {budget == null ? <p className="hint">Set your personal budget to track usage.</p> : <>
        <div className="ex-prog-row"><span className="num">{m(spending)} / {m(budget)}</span>
          {budget === 0 ? <Chip text={spending > 0 ? "Budget exceeded — no budget allocated" : "No budget allocated"} cls="c-warn" /> : remaining! < 0 ? <Chip text={"Exceeded by " + m(-remaining!)} cls="c-bad num" /> : pct! >= 80 ? <Chip text="Approaching budget" cls="c-warn" /> : null}</div>
        <div className="bar"><i style={{ width: Math.min(100, pct == null ? (spending > 0 ? 100 : 0) : pct) + "%" }} /></div></>}
    </section>
    <Analytics expenses={list} personal={personal} m={m} />
    <section className="card pad"><div className="sec-head"><h3>{personal ? "Personal expense history" : "Expense history"}<span className="n num">{rows.length}</span></h3></div>
      <div className="ex-filters" role="search">
        <label className="search ex-q"><Icon n="search" s={16} /><span className="sr">Search expenses</span><input type="search" placeholder="Search expenses..." value={f.query} onChange={(e) => setF({ ...f, query: e.target.value })} /></label>
        <label className="field ex-f">Category<select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All</option>{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field ex-f">Paid by<select className="input" value={f.payer} onChange={(e) => setF({ ...f, payer: e.target.value })}><option value="">All</option>{payers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
        <label className="field ex-f">From<input className="input num" type="date" value={f.from} aria-invalid={bad || undefined} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="field ex-f">To<input className="input num" type="date" value={f.to} aria-invalid={bad || undefined} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <button type="button" className="btn btn-ghost" onClick={() => setF({ query: "", category: "", payer: "", from: "", to: "" })}>Clear filters</button>
      </div>
      {bad && <div className="err" role="alert">From date must be on or before To date.</div>}
      {!list.length ? <Empty icon="receipt" text={personal ? "No expenses allocated to you yet." : "No expenses yet."}>{editable(trip) && <button type="button" className="btn btn-outline btn-sm" onClick={onAdd}><Icon n="plus" s={15} />Add Expense</button>}</Empty>
        : !rows.length ? <Empty icon="filter" text="No expenses match your current search or filters."><button type="button" className="btn btn-outline btn-sm" onClick={() => setF({ query: "", category: "", payer: "", from: "", to: "" })}>Clear filters</button></Empty>
        : <div className="table-box"><table className="ex-table"><thead><tr><th>Date</th><th>Description</th><th>Payer</th><th className="r">Amount</th><th className="r">Your share</th></tr></thead><tbody>
          {rows.map((e) => { const c = expCategory(e.category); return <tr key={e.expenseId} className="click" tabIndex={0} onClick={() => openDetail(e)} onKeyDown={(ev) => { if (ev.key === "Enter") openDetail(e); }}>
            <td className="num muted ex-date">{fd(e.date)}</td>
            <td><span className="place"><span className="ex-ico" style={{ "--c": catColor(c) } as React.CSSProperties}><Icon n={EXP_ICON[c] ?? "receipt"} s={17} /></span><span>{e.description}<small>{c}{e.receipt && <> · <Icon n="receipt" s={12} /></>}</small></span></span></td>
            <td><Person id={e.payerId} name={e.payerName} /></td>
            <td className="num r"><b>{money(e.originalAmount ?? e.amount, e.currencyCode ?? e.baseCurrency)}</b>{(e.currencyCode ?? e.baseCurrency) !== cur && <small className="muted">{m(e.amount)}</small>}</td>
            <td className="num r">{e.shares.length ? m(e.currentUserShare) : <span className="muted">Not split</span>}</td></tr>; })}
        </tbody></table></div>}
    </section>
  </>;
}

export default function Expenses() {
  const { trip } = useTrip(), o = useOverlay(), loc = useLocation(), nav = useNavigate();
  const nav0 = loc.state as { add?: number; expense?: number } | null;
  const [tab, setTab] = useState<"track" | "add" | "balances">(nav0?.add ? "add" : "track");
  // The trip provider remounts this page on a trip switch; visiting another expense tab keeps these choices.
  const [personal, setPersonal] = useState(false), [filters, setFilters] = useState<Filters>({ query: "", category: "", payer: "", from: "", to: "" });
  const [editing, setEditing] = useState<Expense | undefined>(), [presetActivity, setPreset] = useState<number | undefined>(nav0?.add);
  const [data, setData] = useState<Data | null>(null), [err, setErr] = useState(""), [rev, setRev] = useState(0);
  const [display, setDisplay] = useState(trip.baseCurrency), [quote, setQuote] = useState<{ currency: string; rate: number; date: string } | null>(null), [rateErr, setRateErr] = useState(""), [rateTry, setRateTry] = useState(0);
  const reload = useCallback(() => setRev((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    Promise.all([expenseApi.list(trip.tripId), expenseApi.budget(trip.tripId), expenseApi.summary(trip.tripId), expenseApi.personalBudget(trip.tripId)])
      .then(([expenses, budget, summary, personal]) => { if (live) setData({ expenses, budget, summary, personal }); })
      .catch((e) => { if (live) setErr(expenseError(e)); });
    return () => { live = false; };
  }, [trip.tripId, rev]);
  useEffect(() => {
    if (display === trip.baseCurrency) return;
    let live = true;
    expenseApi.displayRate(trip.tripId, display).then((r) => { if (live) setQuote({ currency: display, ...r }); }).catch((e) => { if (live) setRateErr(expenseError(e)); });
    return () => { live = false; };
  }, [trip.tripId, trip.baseCurrency, display, rateTry]);
  const cur = display !== trip.baseCurrency && quote?.currency === display ? display : trip.baseCurrency, rate = cur === trip.baseCurrency ? 1 : quote!.rate;
  const m: Money = useCallback((n: number) => money(n * rate, cur), [rate, cur]);
  const openDetail = useCallback((e: Expense) => {
    o.dialog(<Detail e={e} onEdit={() => { o.closeDialog(); setEditing(e); setTab("add"); }} onDeleted={() => { o.closeDialog(); reload(); }} onChanged={reload} />);
  }, [o, reload]);
  useEffect(() => {
    if (!data || !nav0?.expense) return;
    const e = data.expenses.find((x) => x.expenseId === nav0.expense); if (e) openDetail(e);
    nav(loc.pathname, { replace: true, state: null });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const tabs: [typeof tab, ReactNode][] = editable(trip) ? [["track", "Track"], ["add", "Add Expense"], ["balances", "Balances"]] : [["track", "Track"], ["balances", "Balances"]];
  return <>
    <div className="sec-head ex-top"><h1>Expenses</h1><div className="ex-cur"><span className="hint">Trip currency <b>{trip.baseCurrency}</b></span>
      <label className="ex-cur-sel"><span className="hint">Display in</span><Select label="Display currency" value={display} onChange={(currency) => { setQuote(null); setRateErr(""); setDisplay(currency); }} options={CURRENCIES.map((c) => ({ value: c, label: c }))} /></label></div></div>
    {display !== cur && <div className={"ex-note" + (rateErr ? " warn" : "")} role={rateErr ? "alert" : "status"}><Icon n={rateErr ? "alert" : "loader"} s={15} className={rateErr ? undefined : "spin"} />
      <span>{rateErr || "Loading display rate…"} Showing values in {trip.baseCurrency}.</span>{rateErr && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRateErr(""); setRateTry((n) => n + 1); }}>Retry conversion</button>}</div>}
    {cur !== trip.baseCurrency && <div className="ex-note"><Icon n="info" s={15} /><span className="num">Approximate · 1 {trip.baseCurrency} = {Math.round(rate * 1e4) / 1e4} {cur} · records remain in {trip.baseCurrency}</span></div>}
    <div className="ex-tabs"><Seg name="expTab" value={tab} onChange={(v) => { setEditing(undefined); setPreset(undefined); setTab(v); }} options={tabs} /></div>
    {err ? <section className="card"><Empty icon="alert" text={err}><button type="button" className="btn btn-outline btn-sm" onClick={() => { setErr(""); reload(); }}>Retry</button></Empty></section>
      : !data ? <section className="card pad sk-block" />
      : tab === "balances" ? <ExpenseBalances m={m} onSaved={reload} />
      : tab === "add" ? <ExpenseForm key={editing?.expenseId ?? "new" + presetActivity} expense={editing} presetActivity={presetActivity} onPersisted={reload}
        onDone={(saved) => { setEditing(undefined); setPreset(undefined); setTab("track"); if (saved) reload(); }} />
      : <Track data={data} m={m} cur={cur} reload={reload} openDetail={openDetail} onAdd={() => setTab("add")} personal={personal} setPersonal={setPersonal} f={filters} setF={setFilters} />}
  </>;
}

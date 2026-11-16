import { useCallback, useEffect, useState, type FormEvent } from "react";
import { expenseApi, expenseError, type Balances, type Settlement, type SimplifiedDebts, type SuggestedTransfer, type Obligation } from "../api/expenseApi";
import { useMe, useTrip } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { DlgHead } from "../ui/Overlay";
import { Avatar, Chip, CountUp, Empty, FieldErr, Icon } from "../ui/kit";
import { editable } from "../lib/domain";
import { cents, fdt, fdy, money } from "../lib/format";
import type { Money } from "../lib/expense";

interface Data { balances: Balances; history: Settlement[]; plan: SimplifiedDebts }
function Person({ id, name }: { id: number; name: string }) { return <span className="ex-person"><Avatar id={id} name={name} />{name}</span>; }

function Flows({ rows, cur, me }: { rows: SuggestedTransfer[]; cur: string; me?: number }) {
  return <>{rows.map((r) => <div key={r.fromUserId + "-" + r.toUserId} className="ex-flow"><Avatar id={r.fromUserId} name={r.fromName} /><span>{r.fromUserId === me ? "You" : r.fromName}</span><Icon n="arrow" s={14} />
    <Avatar id={r.toUserId} name={r.toName} /><span>{r.toUserId === me ? "You" : r.toName}</span><b className="num">{money(r.amount, cur)}</b></div>)}</>;
}
/** "Original debts" stay tucked away: a native popover anchored under its link. */
function Original({ plan, kind }: { plan: SimplifiedDebts; kind: "trip" | "me" }) {
  const me = useMe().userId, id = "orig-" + kind;
  const out = plan.originalDebts.filter((r) => r.fromUserId === me), inc = plan.originalDebts.filter((r) => r.toUserId === me);
  const place = (e: React.SyntheticEvent<HTMLDivElement>) => {
    const p = e.currentTarget, b = document.querySelector(`[popovertarget="${id}"]`); if (!b || !(e.nativeEvent as ToggleEvent).newState || (e.nativeEvent as ToggleEvent).newState !== "open") return;
    const r = b.getBoundingClientRect(), w = Math.min(360, innerWidth - 32);
    Object.assign(p.style, { width: w + "px", left: Math.max(16, Math.min(r.left, innerWidth - w - 16)) + "px", top: r.bottom + 8 + "px", maxHeight: Math.max(200, innerHeight - r.bottom - 24) + "px" });
  };
  return <>
    <button type="button" className="orig-link" popoverTarget={id}>{kind === "trip" ? "Trip original debts" : "Your original debts"}<Icon n="right" s={14} /></button>
    <div id={id} popover="auto" className="orig-pop" role="dialog" aria-label="Original expense obligations" onBeforeToggle={place}>
      <div className="op-head"><b>{kind === "trip" ? "Original expense obligations" : "Your original expense obligations"}</b><span className="hint num">Before payments · {plan.currency}</span></div>
      {kind === "trip" ? <>
        <div className="op-cmp"><span><small>Original</small><b className="num">{plan.originalPairwiseRelationships}</b></span><Icon n="arrow" s={16} /><span><small>Simplified</small><b className="num">{plan.transfers.length}</b></span></div>
        {plan.originalDebts.length ? <Flows rows={plan.originalDebts} cur={plan.currency} /> : <p className="hint">No original expense obligations.</p>}
      </> : <>
        <h4>Originally owed by you</h4>{out.length ? <Flows rows={out} cur={plan.currency} me={me} /> : <p className="hint">No original outgoing obligations.</p>}
        <h4>Originally owed to you</h4>{inc.length ? <Flows rows={inc} cur={plan.currency} me={me} /> : <p className="hint">No original incoming obligations.</p>}
      </>}
    </div>
  </>;
}

function Pay({ creditors: initialCreditors, suggestion, existing, onSaved, onRefresh }: { creditors: Obligation[]; suggestion?: SuggestedTransfer; existing?: Settlement; onSaved: (msg: string) => void; onRefresh: () => Promise<Obligation[]> }) {
  const { trip, people } = useTrip(), me = useMe(), o = useOverlay();
  // Overlay content is mounted once. Refresh its own limits after a rejected write as well as the page behind it.
  const [creditors, setCreditors] = useState(initialCreditors), [fresh, setFresh] = useState(true), [refreshErr, setRefreshErr] = useState("");
  const options = existing ? people.filter((p) => p.id !== me.userId).map((p) => ({ id: p.id, name: p.name })) : creditors.map((c) => ({ id: c.userId, name: c.name }));
  if (existing && !options.some((x) => x.id === existing.payeeId)) options.unshift({ id: existing.payeeId, name: existing.payeeName + " (no longer active)" });
  const [payee, setPayee] = useState(existing?.payeeId ?? suggestion?.toUserId ?? options[0]?.id ?? 0);
  const [amount, setAmount] = useState(existing ? existing.amount.toFixed(2) : suggestion ? suggestion.amount.toFixed(2) : ""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const limit = creditors.find((c) => c.userId === payee)?.amount;
  const eligible = existing || limit != null;
  const refresh = async () => {
    setBusy(true); setFresh(false); setRefreshErr("");
    try { setCreditors(await onRefresh()); setFresh(true); }
    catch { setRefreshErr("Could not refresh balances. Retry before recording this payment."); }
    finally { setBusy(false); }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busy || !fresh) return;
    const c = cents(amount);
    const msg = !eligible ? "This member is no longer an eligible payee. Choose another member." : !amount || Number(amount) <= 0 ? "Enter an amount greater than zero." : c == null ? "Use at most two decimal places." : c > 9999999999 ? `Enter ${money(99999999.99, trip.baseCurrency)} or less.`
      : !existing && limit != null && c > Math.round(limit * 100) ? `The current net payment limit is ${money(limit, trip.baseCurrency)}.` : "";
    setErr(msg); if (msg) return;
    setBusy(true);
    try {
      if (existing) await expenseApi.editPayment(trip.tripId, existing.settlementId, payee, amount); else await expenseApi.recordPayment(trip.tripId, payee, amount);
      o.closeDialog(); onSaved("Payment saved.");
    } catch (ex) { setErr(expenseError(ex)); await refresh(); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} noValidate>
    <DlgHead title={existing ? "Edit Payment" : "Record Payment"} onClose={o.closeDialog} />
    <div className="pay-flow"><Avatar id={me.userId} name={me.username} size={44} /><Icon n="arrow" s={18} />{payee ? <Avatar id={payee} name={options.find((x) => x.id === payee)?.name ?? ""} size={44} /> : null}</div>
    <div className="row2"><label className="field">From<input className="input" value={me.username} readOnly /></label>
      <label className="field">To<select className="input" value={payee} disabled={busy || !fresh} onChange={(e) => { setPayee(Number(e.target.value)); if (!existing) setAmount(""); setErr(""); }}>
        {!eligible && <option value={payee} disabled>No longer eligible — choose a member</option>}{options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label></div>
    {existing && <div className="hint num">Settlement #{existing.settlementId} · Recorded {fdt(existing.settledAt)}</div>}
    <label className="field">Amount ({trip.baseCurrency})<input className="input num" type="number" min="0.01" step="0.01" value={amount} disabled={busy} onChange={(e) => setAmount(e.target.value)} autoFocus /></label>
    {!fresh && busy && <div className="hint" role="status">Refreshing payment limits…</div>}
    {fresh && !existing && limit != null && <div className="hint num" role="status">Current net payment limit: {money(limit, trip.baseCurrency)}</div>}
    {fresh && !eligible && <div className="hint" role="status">This member is no longer an eligible payee. {options.length ? "Choose another member." : "No payments are currently required."}</div>}
    {fresh && !existing && limit != null && (cents(amount) ?? 0) > Math.round(limit * 100) && <FieldErr msg={`Amount exceeds the current net payment limit of ${money(limit, trip.baseCurrency)}.`} />}
    <FieldErr msg={err} />
    {refreshErr && <div><FieldErr msg={refreshErr} /><button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={refresh}>Retry balances</button></div>}
    <div className="dlg-foot"><button type="button" className="btn btn-ghost" onClick={o.closeDialog}>Cancel</button><button className="btn btn-primary" disabled={busy || !fresh || !eligible}>{existing ? "Save changes" : "Record Payment"}</button></div>
  </form>;
}

/** Who owes whom after payments, the simplified transfers, and payment history (edit or delete your own; deleted ones stay as voided). */
export default function ExpenseBalances({ m, onSaved }: { m: Money; onSaved: () => void }) {
  const { trip } = useTrip(), me = useMe(), o = useOverlay();
  const [data, setData] = useState<Data | null>(null), [err, setErr] = useState("");
  const load = useCallback(() => Promise.all([expenseApi.balances(trip.tripId), expenseApi.settlements(trip.tripId), expenseApi.simplify(trip.tripId)])
    .then(([balances, history, plan]) => { const next = { balances, history, plan }; setData(next); setErr(""); return next; })
    .catch((e) => { setErr(expenseError(e)); return null; }), [trip.tripId]);
  useEffect(() => { void load(); }, [load]);
  if (err) return <section className="card"><Empty icon="alert" text={err}><button type="button" className="btn btn-outline btn-sm" onClick={() => { setErr(""); load(); }}>Retry</button></Empty></section>;
  if (!data) return <section className="card pad sk-block" />;
  const { balances: b, plan } = data, can = editable(trip), creditors = b.eligiblePayees;
  const saved = (msg: string) => { load(); if (msg) { onSaved(); o.toast(msg); } };
  const pay = (suggestion?: SuggestedTransfer, existing?: Settlement) => o.dialog(<Pay creditors={creditors} suggestion={suggestion} existing={existing} onSaved={saved} onRefresh={async () => {
    const next = await load(); if (!next) throw new Error("Balances unavailable"); return next.balances.eligiblePayees;
  }} />);
  const del = async (s: Settlement) => {
    const ok = await o.confirm({ title: "Delete Settlement?", label: "Delete settlement", danger: true,
      body: <>{s.payerName} → {s.payeeName} · {money(s.amount, trip.baseCurrency)}<br />The payment will no longer count toward trip balances. This does not reverse an actual bank transfer.</> });
    if (!ok) return;
    try { await expenseApi.voidPayment(trip.tripId, s.settlementId); saved("Payment deleted. Record retained as voided."); } catch (ex) { o.toast(expenseError(ex)); load(); }
  };
  const bySet = (x: Settlement, y: Settlement) => (x.settledAt < y.settledAt ? 1 : -1);
  const active = data.history.filter((s) => !s.voidedAt).sort(bySet), voided = data.history.filter((s) => s.voidedAt).sort(bySet);
  const ob = (title: string, rows: Obligation[], total: number, empty: string, tone: string) => <section className="stat card ex-ob"><div className="stat-label">{title}</div>
    <div className={"stat-value num " + tone}>{m(total)}</div>
    {rows.length ? <div className="ex-ob-list">{rows.map((r) => <div key={r.userId} className="kv"><span><Person id={r.userId} name={r.name} /></span><span className="num">{m(r.amount)}</span></div>)}</div> : <small className="hint">{empty}</small>}</section>;
  return <>
    <div className="ex-bal-top">
      {ob("You owe", b.youOwe, b.totalYouOwe, "You have no net debt.", "owe")}
      {ob("You are owed", b.youAreOwed, b.totalYouAreOwed, "You have no net receivable.", "owed")}
      <section className="stat card ex-net"><div className="stat-label">Net balance</div>
        <div className={"stat-value num " + (b.netBalance < 0 ? "owe" : b.netBalance > 0 ? "owed" : "")}><CountUp value={b.netBalance} k="ex-net" format={m} /></div><small className="hint">After recorded payments.</small>
        <button type="button" className="btn btn-primary" disabled={!creditors.length || !can} onClick={() => pay()}><Icon n="check" s={16} />Record Payment</button></section>
    </div>
    <div className="ex-orig-me"><Original plan={plan} kind="me" /></div>
    <div className="ex-bal-grid">
      <section className="card pad"><div className="sec-head"><h3>Simplified Debts</h3><Original plan={plan} kind="trip" /></div>
        <div className="ex-transfers">{plan.transfers.length ? plan.transfers.map((x) => {
          const mine = x.fromUserId === me.userId && can && creditors.some((c) => c.userId === x.toUserId);
          return <div key={x.fromUserId + "-" + x.toUserId} className={"transfer" + (x.fromUserId === me.userId ? " mine" : "")}>
            <Avatar id={x.fromUserId} name={x.fromName} /><span className="ex-tn">{x.fromName}</span><Icon n="arrow" s={16} /><Avatar id={x.toUserId} name={x.toName} /><span className="ex-tn">{x.toName}</span>
            <span className="amt num">{m(x.amount)}</span>{mine && <button type="button" className="btn btn-solid btn-sm" onClick={() => pay(x)}>Record Payment</button>}</div>;
        }) : <Empty icon="check" text="All net balances are settled." />}</div></section>
      <section className="card pad"><div className="sec-head"><h3>Settlement History<span className="n num">{active.length}</span></h3></div>
        {active.length ? <div className="table-box"><table className="ex-table"><thead><tr><th>Date</th><th>From</th><th>To</th><th className="r">Amount</th><th><span className="sr">Actions</span></th></tr></thead><tbody>
          {active.map((s) => <tr key={s.settlementId}><td className="num muted ex-date">{fdy(s.settledAt)}</td><td><Person id={s.payerId} name={s.payerName} /></td><td><Person id={s.payeeId} name={s.payeeName} /></td>
            <td className="num r"><b>{m(s.amount)}</b></td>
            <td className="r ex-acts">{s.payerId === me.userId && can && <><button type="button" className="btn btn-ghost btn-sm" onClick={() => pay(undefined, s)}><Icon n="edit" s={14} />Edit</button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => del(s)}><Icon n="trash" s={14} />Delete</button></>}</td></tr>)}
        </tbody></table></div> : <Empty icon="swap" text="No active payments recorded for this trip yet." />}
        {voided.length > 0 && <details className="ex-voided"><summary><Icon n="right" s={14} />Voided settlements ({voided.length})</summary><div>
          {voided.map((s) => <div key={s.settlementId} className="list-row void"><Chip text="Voided" /><span style={{ flex: 1 }}><b>{s.payerName} → {s.payeeName}</b> · <s className="num">{m(s.amount)}</s>
            <small className="hint num" style={{ display: "block" }}>#{s.settlementId} · Recorded {fdt(s.settledAt)} · Voided {fdt(s.voidedAt!)}</small></span></div>)}
        </div></details>}
      </section>
    </div>
  </>;
}

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { expenseApi, expenseError, type Expense, type ExpenseInput } from "../api/expenseApi";
import { useTrip, useMe } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { Avatar, FieldErr, Icon, Seg } from "../ui/kit";
import Select from "../ui/Select";
import { CURRENCIES, cents, fd, money, sum, today } from "../lib/format";
import FilePreview from "./FilePreview";
import { EXP_CATS } from "../lib/expense";

type Mode = "EQUAL" | "CUSTOM" | "BY_ITEM";
interface Item { name: string; amount: string; quantity: string; userIds: number[]; shut: boolean }
/** Equal splits and item lines hand out remainder cents in user-ID order, like ExpenseService. */
function split(c: number, ids: number[]) {
  const o = [...ids].sort((a, b) => a - b), out: Record<number, number> = {};
  o.forEach((u, i) => { out[u] = Math.floor(c / o.length) + (i < c % o.length ? 1 : 0); });
  return out;
}
const qty = (q: string) => (q.trim() === "" ? 1 : /^\d+$/.test(q.trim()) && +q >= 1 ? +q : null);
function fitSplit(form: HTMLFormElement | null) {
  if (!form) return;
  const top = form.getBoundingClientRect().top + window.scrollY;
  form.style.setProperty("--ef-split-height", `${Math.max(240, window.innerHeight - Math.max(16, top) - 24)}px`);
}

/** Add or edit an expense (ExpenseRequest): split equally, by custom amounts, or item by item; receipt uploaded after saving. */
export default function ExpenseForm({ expense, presetActivity, onDone, onPersisted }: { expense?: Expense; presetActivity?: number; onDone: (saved: boolean) => void; onPersisted: () => void }) {
  const { trip, activities, people } = useTrip(), o = useOverlay(), me = useMe();
  const ids = people.map((p) => p.id), link = presetActivity ? activities.find((a) => a.id === presetActivity) : undefined;
  const [v, setV] = useState({
    description: expense?.description ?? link?.name ?? "", category: expense?.category ?? "Other", date: expense?.date ?? link?.date ?? today(),
    activityId: expense?.activityId ?? link?.id ?? null as number | null, amount: expense ? String(expense.originalAmount ?? expense.amount) : "",
    currency: expense?.currencyCode ?? trip.baseCurrency, payerId: expense ? (ids.includes(expense.payerId) ? String(expense.payerId) : "") : ids.includes(me.userId) ? String(me.userId) : "", /* a new expense is usually paid by whoever enters it */
  });
  // Existing allocations open as custom so their exact amounts are kept.
  const [mode, setMode] = useState<Mode>(expense?.splitMode === "BY_ITEM" ? "BY_ITEM" : expense?.splitMode === "EQUAL" ? "EQUAL" : expense?.shares.length ? "CUSTOM" : "EQUAL");
  const [selected, setSelected] = useState<number[]>(expense?.shares.length ? expense.shares.map((s) => s.userId).filter((u) => ids.includes(u)) : link?.memberIds.length ? link.memberIds.filter((u) => ids.includes(u)) : ids);
  const [custom, setCustom] = useState<Record<number, string>>(() => Object.fromEntries(expense?.shares.map((s) => [s.userId, (s.originalShareAmount ?? s.shareAmount).toFixed(2)]) ?? []));
  const [items, setItems] = useState<Item[]>(expense?.items?.map((it) => ({ name: it.name, amount: it.amount.toFixed(2), quantity: it.quantity ? String(it.quantity) : "", userIds: it.allocations.map((a) => a.userId), shut: false })) ?? []);
  const [file, setFile] = useState<File | null>(null), [dropReceipt, setDropReceipt] = useState(false);
  const [touched, setTouched] = useState(false), [submitted, setSubmitted] = useState(false), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const [receiptErr, setReceiptErr] = useState(""), [persisted, setPersisted] = useState(false);
  const savedId = useRef(expense?.expenseId), savedDraft = useRef("");
  const fileRef = useRef<HTMLInputElement>(null), formRef = useRef<HTMLFormElement>(null), splitRef = useRef<HTMLElement>(null), lastItemRef = useRef<HTMLDivElement>(null), focusNew = useRef(false);
  useLayoutEffect(() => fitSplit(formRef.current));
  useEffect(() => { const resize = () => fitSplit(formRef.current); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
  useLayoutEffect(() => {
    if (!focusNew.current) return;
    focusNew.current = false;
    const item = lastItemRef.current, panel = splitRef.current, input = item?.querySelector("input");
    if (!item || !panel || !input) return;
    input.focus({ preventScroll: true });
    if (window.matchMedia("(min-width: 1181px)").matches) panel.scrollTo({ top: panel.scrollTop + item.getBoundingClientRect().top - panel.getBoundingClientRect().top - 12 });
    else input.scrollIntoView({ block: "nearest" });
  }, [items.length]);
  const m = (c: number) => money(c / 100, v.currency);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => { setV({ ...v, [k]: e.target.value }); if (k === "amount") setTouched(true); };

  const ord = [...new Set(mode === "BY_ITEM" ? items.flatMap((it) => it.userIds) : selected)].sort((a, b) => a - b);
  const formerIds = [...new Set(items.flatMap((it) => it.userIds))].filter((id) => !ids.includes(id));
  const formerName = (id: number) => expense?.shares.find((s) => s.userId === id)?.username ?? expense?.items.flatMap((it) => it.allocations).find((a) => a.userId === id)?.username ?? `Member #${id}`;
  const summaryPeople = [...people, ...formerIds.map((id) => ({ id, name: formerName(id) }))];
  const ic = items.map((it) => { const c = cents(it.amount), q = qty(it.quantity); return c == null || q == null ? null : c * q; });
  const itemTotal = sum(ic.map((x) => x ?? 0)), total = mode === "BY_ITEM" ? itemTotal : cents(v.amount);
  const eq = total == null || !ord.length ? {} : split(total, ord);
  const cv = ord.map((u) => cents(custom[u])), customTotal = sum(cv.map((x) => x ?? 0)), customValid = cv.every((x) => x != null) && customTotal === total;
  const its: Record<number, number> = {}; ord.forEach((u) => { its[u] = 0; });
  items.forEach((it, i) => { const s = split(ic[i] ?? 0, it.userIds); Object.entries(s).forEach(([u, c]) => { its[+u] = (its[+u] ?? 0) + c; }); });
  const itemValid = items.length > 0 && items.every((it, i) => it.name.trim() && (ic[i] ?? 0) > 0 && it.userIds.length && it.userIds.every((u) => ids.includes(u)));
  const valid = !!v.payerId && ord.length > 0 && total != null && total > 0 && total <= 9999999999 && (mode === "BY_ITEM" ? itemValid : mode === "EQUAL" || customValid);
  const allocErr = mode !== "CUSTOM" || !(touched || submitted) ? "" : total == null || total <= 0 ? "Enter a positive amount with at most two decimal places." : !ord.length ? "Select at least one participant."
    : cv.some((x) => x == null) ? "Enter a valid share for each selected member." : !customValid ? `Shares must total ${m(total)}.` : "";
  const itemErr = mode !== "BY_ITEM" || !submitted ? "" : !items.length ? "Add at least one item." : formerIds.length ? "Remove former members from their items and review the split before saving." : items.some((it) => !it.userIds.length) ? "Assign all items before saving."
    : !itemValid ? "Complete each item’s name, price and quantity." : "";
  const allocated = mode === "CUSTOM" ? customTotal : mode === "BY_ITEM" ? itemTotal : ord.length ? total ?? 0 : 0;
  const unassigned = items.filter((it) => !it.userIds.length).length;
  const setItem = (i: number, patch: Partial<Item>) => setItems(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const pickMode = (next: Mode) => { if (next !== mode) setSubmitted(false); setMode(next); if (next === "BY_ITEM" && !items.length) setItems([{ name: "", amount: "", quantity: "", userIds: [], shut: false }]); };
  const draft = JSON.stringify([v, mode, selected, custom, items.map((it) => [it.name, it.amount, it.quantity, it.userIds])]);

  const saveReceipt = async (id: number) => {
    if (file) await expenseApi.uploadReceipt(trip.tripId, id, file);
    else if (dropReceipt && expense?.receipt) await expenseApi.removeReceipt(trip.tripId, id);
  };
  const retryReceipt = async () => {
    if (busy || !savedId.current) return;
    setBusy(true);
    try {
      await saveReceipt(savedId.current); setReceiptErr(""); onPersisted();
      if (draft === savedDraft.current) onDone(true);
      else o.toast("Receipt saved. Save Expense to keep your other changes.");
    } catch (ex) { setReceiptErr(expenseError(ex)); } finally { setBusy(false); }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return; setSubmitted(true);
    const desc = v.description.trim();
    const msg = !desc ? "Enter a description." : !v.date ? "Choose a date." : !v.payerId ? "Select who paid." : mode !== "BY_ITEM" && !ord.length ? "Select at least one participant."
      : mode !== "BY_ITEM" && (total == null || total <= 0) ? "Enter a positive amount with at most two decimal places." : (total ?? 0) > 9999999999 ? "Enter 99,999,999.99 or less." : !valid ? "Check the split before saving." : "";
    setErr(msg); if (msg) return;
    const body: ExpenseInput = {
      description: desc, category: v.category, date: v.date, currencyCode: v.currency, payerId: Number(v.payerId), splitMode: mode, activityId: v.activityId,
      amount: (total! / 100).toFixed(2),
      participants: ord.map((userId) => (mode === "CUSTOM" ? { userId, shareAmount: custom[userId] } : { userId })),
      items: mode === "BY_ITEM" ? items.map((it) => ({ name: it.name.trim(), amount: it.amount, quantity: it.quantity.trim() ? Number(it.quantity) : undefined, userIds: it.userIds })) : undefined,
    };
    setBusy(true); setReceiptErr("");
    try {
      const saved = await expenseApi.save(trip.tripId, body, savedId.current);
      savedId.current = saved.expenseId; setPersisted(true); savedDraft.current = draft; onPersisted();
      try { await saveReceipt(saved.expenseId); }
      catch (ex) { setReceiptErr(expenseError(ex)); return; }
      o.toast(expense ? "Expense saved" : "Expense added"); onDone(true);
    } catch (ex) { setErr(expenseError(ex)); } finally { setBusy(false); }
  };

  const shareOf = (u: number) => { const c = mode === "BY_ITEM" ? its[u] : (eq as Record<number, number>)[u]; return c == null ? "—" : m(c); };
  const hasReceipt = !!file || (!!expense?.receipt && !dropReceipt);
  return <form ref={formRef} onSubmit={save} noValidate>
    <fieldset className="ef" disabled={busy} aria-busy={busy}>
    <section className="card pad ef-main"><h3>{expense ? "Edit expense" : "Add expense"}</h3>
      <div className="ef-fields">
        <label className="field ef-wide">Description<input className="input" maxLength={200} value={v.description} onChange={set("description")} /></label>
        <label className="field">Category<Select label="Category" value={v.category} disabled={busy} onChange={(category) => setV({ ...v, category })} options={[...new Set([...EXP_CATS, v.category])].map((c) => ({ value: c, label: c }))} /></label>
        <label className="field">Date<input className="input num" type="date" value={v.date} onChange={set("date")} /></label>
        <label className="field ef-wide">Activity<Select label="Activity" value={String(v.activityId ?? "")} disabled={busy} onChange={(activityId) => setV({ ...v, activityId: activityId ? Number(activityId) : null })}
          options={[{ value: "", label: "None" }, ...[...activities].sort((a, b) => (a.date ?? "9") < (b.date ?? "9") ? -1 : 1).map((a) => ({ value: String(a.id), label: a.name, description: `${a.date ? fd(a.date) : "Unscheduled"} · ${a.location}` }))]} /></label>
        <div className="field">Amount<div className="ef-amt">
          <input className="input num" type="number" min="0.01" max="99999999.99" step="0.01" aria-label="Amount" readOnly={mode === "BY_ITEM"} value={mode === "BY_ITEM" ? (itemTotal / 100).toFixed(2) : v.amount} onChange={set("amount")} onBlur={() => setTouched(true)} />
          <Select label="Expense currency" value={v.currency} disabled={busy} onChange={(currency) => setV({ ...v, currency })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} /></div>
          {v.currency !== trip.baseCurrency && <small>Shares in {v.currency} · Trip currency: {trip.baseCurrency}</small>}</div>
        <label className="field">Paid by<Select label="Paid by" value={v.payerId} disabled={busy} onChange={(payerId) => setV({ ...v, payerId })}
          options={[{ value: "", label: "Select a member" }, ...people.map((p) => ({ value: String(p.id), label: p.name }))]} /></label>
        <div className="field ef-wide">Split<div><Seg name="efMode" value={mode} onChange={pickMode} options={[["EQUAL", "Equal"], ["CUSTOM", "Custom"], ["BY_ITEM", "By Item"]]} /></div></div>
        <div className="field ef-wide">Receipt<div className="ef-rcpt">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}><Icon n="upload" s={15} />{hasReceipt ? "Change" : "Upload"}</button>
          <span className="hint">{file?.name ?? (!dropReceipt ? expense?.receipt?.fileName : null) ?? (dropReceipt ? "Receipt will be removed on save." : "No file selected")}</span>
          {expense?.receipt && !dropReceipt && !file && <><FilePreview load={() => expenseApi.receipt(expense.tripId, expense.expenseId)} type={expense.receipt.contentType} name={expense.receipt.fileName} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDropReceipt(true)}>Remove</button></>}
          {file && <FilePreview key={file.name + file.size + file.lastModified} load={() => Promise.resolve(file)} type={file.type} name={file.name} label="Preview" />}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setDropReceipt(false); } e.target.value = ""; }} />
        </div></div>
      </div>
      <FieldErr msg={err} />
      {receiptErr && <div className="ef-receipt-error" role="alert"><b>Expense saved. Receipt {dropReceipt && !file ? "removal" : "upload"} failed.</b><span>{receiptErr}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={retryReceipt}>Retry receipt {dropReceipt && !file ? "removal" : "upload"}</button></div>}
      <div className="dlg-foot"><button type="button" className="btn btn-ghost" onClick={() => onDone(persisted)}>{persisted ? "Close" : "Cancel"}</button><button className="btn btn-primary" disabled={busy}><Icon n="check" s={16} />{busy ? "Saving…" : "Save Expense"}</button></div>
    </section>
    <aside className="card pad ef-split" ref={splitRef} aria-label={mode === "BY_ITEM" ? "Item allocation" : "Split between"}>
      <h3>{mode === "BY_ITEM" ? "Total per person" : "Split between"}</h3>
      <div className="ef-rows" aria-label={mode === "BY_ITEM" ? "Totals per person" : "Participants"}>{(mode === "BY_ITEM" ? summaryPeople : people).map((p) => {
        const on = ord.includes(p.id);
        return <div key={p.id} className={"ef-row" + (on ? " on" : "")}>
          {mode === "BY_ITEM" ? <span className="ef-person"><Avatar id={p.id} name={p.name} /><span>{p.name}{!ids.includes(p.id) && <small className="hint">Former member</small>}</span></span>
            : <label className="ef-check"><input type="checkbox" checked={on}
            onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} /><span className="box"><Icon n="check" s={13} /></span><Avatar id={p.id} name={p.name} /><span>{p.name}</span></label>
          }
          {!on ? <span className="ef-share muted">—</span> : mode === "CUSTOM"
            ? <input className="input num ef-cust" type="number" min="0" max="99999999.99" step="0.01" placeholder="0.00" aria-label={"Share for " + p.name} value={custom[p.id] ?? ""} onChange={(e) => { setCustom({ ...custom, [p.id]: e.target.value }); setTouched(true); }} />
            : <span className="ef-share num">{shareOf(p.id)}</span>}
        </div>;
      })}</div>
      {mode === "BY_ITEM" && <div className="ef-items"><h4>Items</h4>
        {formerIds.length > 0 && <p className="hint" role="status">Some participants have left this trip. Remove them from each item and review its participants before saving.</p>}
        {items.map((it, i) => <div key={i} ref={i === items.length - 1 ? lastItemRef : undefined} className={"ef-item" + (it.shut ? " shut" : "")}>
          <div className="ef-item-head"><button type="button" className="ef-item-toggle" aria-expanded={!it.shut} onClick={() => setItem(i, { shut: !it.shut })}>
            <span className="ef-item-n">Item {i + 1}</span>{it.shut && <><span className="ef-item-sum">{it.name.trim() || "Untitled item"}{+it.quantity > 1 ? ` ×${it.quantity}` : ""}</span><b className="num">{ic[i] == null ? "—" : m(ic[i]!)}</b></>}<Icon n="chev" s={14} className="chev" /></button>
            <button type="button" className="icon-btn sm ef-item-x" aria-label={"Remove item " + (i + 1)} onClick={() => setItems(items.filter((_, k) => k !== i))}><Icon n="trash" s={15} /></button></div>
          {!it.shut && <div className="ef-item-fields">
            <label className="field">Item name<input className="input" maxLength={200} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} /></label>
            <div className="row2"><label className="field">Unit price ({v.currency})<input className="input num" type="number" min="0.01" step="0.01" value={it.amount} onChange={(e) => setItem(i, { amount: e.target.value })} /></label>
              <label className="field">Quantity (optional)<input className="input num" type="number" min="1" step="1" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} /></label></div>
            <div className="field">Split between<div className="who">{people.map((p) => <label key={p.id}><input type="checkbox" checked={it.userIds.includes(p.id)}
              onChange={(e) => setItem(i, { userIds: e.target.checked ? [...it.userIds, p.id] : it.userIds.filter((x) => x !== p.id) })} /><span><Avatar id={p.id} name={p.name} />{p.name}</span></label>)}
              {it.userIds.filter((id) => !ids.includes(id)).map((id) => <label key={id} className="ef-former"><input type="checkbox" checked aria-label={`Former member #${id}: ${formerName(id)} (remove)`} onChange={() => setItem(i, { userIds: it.userIds.filter((u) => u !== id) })} /><span>{formerName(id)} · Former member (remove)</span></label>)}
            </div></div>
          </div>}
        </div>)}
        <button type="button" className="add-wide" onClick={() => { focusNew.current = true; setItems([...items, { name: "", amount: "", quantity: "", userIds: [], shut: false }]); }}><Icon n="plus" />Add Item</button>
        <div className="ef-total main"><span>Expense total</span><b className="num">{m(itemTotal)}</b></div>
        {unassigned > 0 && <div className="hint" role="status">Assigned {m(sum(Object.values(its)))} · {unassigned} item{unassigned > 1 ? "s need" : " needs"} participants</div>}
        <FieldErr msg={itemErr} />
      </div>}
      {mode !== "BY_ITEM" && <><div className="ef-total main"><span>Allocated{mode === "EQUAL" && selected.length > 0 && <span className="ef-tipi" title="Remainder cents follow user ID order."> <Icon n="info" s={13} /></span>}</span><b className="num">{m(allocated)}</b></div>
        {!selected.length && <div className="hint">Select at least one participant.</div>}</>}
      <FieldErr msg={allocErr} />
    </aside>
    </fieldset>
  </form>;
}

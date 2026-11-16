import { useNavigate } from "react-router-dom";
import { joinScheduledActivity, leaveScheduledActivity } from "../api/activityApi";
import { expenseApi } from "../api/expenseApi";
import { apiErrorMessage } from "../api/apiError";
import { useMe, useTrip } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { Avatar, Chip, Empty, Icon, LoadError, Stack } from "../ui/kit";
import { useLoad } from "../lib/useLoad";
import { canPlace, catIcon, catKey, chipOf, editable, overlaps, toneOf } from "../lib/domain";
import { fd, fwd, hm, money } from "../lib/format";
import { removeActivity, schedulePlan, unbranch } from "../lib/actions";
import Photo from "./Photo";
import { BranchDialog, ScheduleDialog } from "./PlanDialogs";
import { Attachments } from "./TripFiles";
import { usePeek } from "./usePeek";

/**
 * A plan on the calendar, laid out like the activity window: the photo, then beside it what it is and the facts that
 * matter on the day (when, who's going, what else runs at the same time, what it cost). Votes, preferred times and
 * comments stay on the activity, one tap away.
 */
export default function PlanDrawer({ id }: { id: number }) {
  const store = useTrip(), me = useMe(), o = useOverlay(), peek = usePeek(), nav = useNavigate();
  const a = store.activities.find((x) => x.id === id), t = store.trip;
  const exp = useLoad(() => expenseApi.list(t.tripId).then((l) => l.filter((e) => e.activityId === id)), [t.tripId, id], "Couldn't load the linked expenses."), expenses = exp.data;
  if (!a) return <Empty icon="alert" text="This plan was removed" />;
  if (!a.date) return <Empty icon="cal" text="Not on the calendar"><button type="button" className="btn btn-outline btn-sm" onClick={() => peek.idea(a.id)}>Open activity</button></Empty>;
  /* Everything else on at the same time: group plans first, then branches. Joining one moves you off this one. */
  const others = store.activities.filter((x) => x.id !== a.id && overlaps(a, x))
    .sort((x, y) => Number(x.branch) - Number(y.branch) || (x.startTime! < y.startTime! ? -1 : 1));
  const going = a.memberIds.includes(me.userId), mod = a.canModify && editable(t), place = canPlace(t, a), [label, cls, icon] = chipOf(a);
  const join = async () => {
    try { await (going ? leaveScheduledActivity(a.id) : joinScheduledActivity(a.id)); await store.refreshActivities(); }
    catch (e) { o.toast(apiErrorMessage(e, "Could not change who's going")); }
  };
  const unschedule = async () => {
    try { await schedulePlan(store, a, { date: null, startTime: null, endTime: null }); o.closeDrawer(); o.toast(a.name + (a.branch ? " back to Branches" : " back to To schedule"), () => schedulePlan(store, a, { date: a.date, startTime: a.startTime, endTime: a.endTime }).catch((e) => o.toast(apiErrorMessage(e, "Could not undo")))); }
    catch (e) { o.toast(apiErrorMessage(e, "Could not unschedule")); }
  };
  const remove = async () => { if (await removeActivity(store, o, a)) o.closeDrawer(); };
  const toVoting = async () => { if (await unbranch(store, o, a)) o.closeDrawer(); };
  const total = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  return <>
    <div className="dlg-head"><span className="peek-chips"><Chip text={label} cls={cls} icon={icon} />{a.branch && <Chip text="Branch" cls="c-violet" icon="branch" />}<Chip text={a.category} cls={"cat-" + catKey(a.category)} icon={catIcon(a.category)} /></span>
      <button type="button" className="icon-btn" aria-label="Close" onClick={o.closeDrawer}><Icon n="x" s={20} /></button></div>
    <div className="peek-grid">
      <div className="peek-col">
        <Photo src={a.imageUrls[0]} category={a.category} tone={toneOf(a.id)} big={a.imageUrls.length > 0} />
      </div>
      <div className="peek-col">
        <div className="peek-title"><h2>{a.name}</h2>
          <div className="meta full" style={{ marginTop: 8 }}><Icon n="pin" s={14} /><span>{a.location || "No address"}</span></div></div>
        <div className="facts">
          <div className="fact"><span className="fact-ico"><Icon n="cal" s={17} /></span>
            <span className="fact-txt"><small>When</small><b className="num">{fwd(a.date)} {fd(a.date)} · {hm(a.startTime)}–{hm(a.endTime)}</b></span>
            {place && <button type="button" className="btn btn-ghost btn-sm" onClick={() => o.dialog(<ScheduleDialog a={a} />)}><Icon n="clock" s={15} />Change</button>}</div>
          <div className="fact"><span className={"fact-ico" + (a.branch ? " branch" : "")}><Icon n="user" s={17} /></span>
            <span className="fact-txt"><small>Going · {a.memberIds.length}</small>{a.memberIds.length
              ? <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{a.memberIds.map((m) => <Avatar key={m} id={m} name={store.name(m)} size={28} onClick={() => peek.person(m, store.name(m))} />)}</span>
              : <b className="muted">Nobody yet</b>}</span>
            {editable(t) && <button type="button" className={"btn btn-sm " + (going ? "btn-outline" : "btn-primary")} onClick={join}>{going ? "Leave" : "Join"}</button>}</div>
          <div className="fact fact-col">
            <div className="fact-top"><span className="fact-ico"><Icon n="branch" s={17} /></span>
              <span className="fact-txt"><small>Same time</small>{!others.length && <b className="muted">Nothing else</b>}</span>
              {editable(t) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => o.dialog(<BranchDialog at={a} />, { wide: true })}><Icon n="plus" s={15} />Branch</button>}</div>
            {others.map((x) => <button key={x.id} type="button" className={"fact-item" + (x.branch ? " is-branch" : "")} onClick={() => peek.plan(x.id)}>
              {x.branch ? <Icon n="branch" s={15} className="branch-ico" /> : <span className={"cat-dot dot-" + catKey(x.category)} />}
              <span className="fact-item-txt"><b>{x.name}</b><small className="num">{hm(x.startTime)}–{hm(x.endTime)}</small></span>
              <Stack people={x.memberIds.map((m) => ({ id: m, name: store.name(m) }))} max={3} /></button>)}
          </div>
          <div className="fact fact-col">
            <div className="fact-top"><span className="fact-ico"><Icon n="receipt" s={17} /></span>
              <span className="fact-txt"><small>Expenses{expenses && " · " + expenses.length}</small>{expenses && (expenses.length ? <b className="num">{money(total, t.baseCurrency)}</b> : <b className="muted">None yet</b>)}</span>
              {editable(t) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { o.closeDrawer(); nav(`/trip/${t.tripId}/expenses`, { state: { add: a.id } }); }}><Icon n="plus" s={15} />Expense</button>}</div>
            {exp.error && !expenses && <LoadError compact text={exp.error} onRetry={exp.retry} />}
            {expenses?.map((e) => <button key={e.expenseId} type="button" className="fact-item" onClick={() => { o.closeDrawer(); nav(`/trip/${t.tripId}/expenses`, { state: { expense: e.expenseId } }); }}>
              <Avatar id={e.payerId} name={e.payerName} size={26} /><span className="fact-item-txt"><b>{e.description}</b></span><b className="num">{money(e.originalAmount ?? e.amount, e.currencyCode ?? e.baseCurrency)}</b></button>)}
          </div>
          <Attachments activity={a} />
        </div>
      </div>
    </div>
    <div className="dlg-foot" style={{ justifyContent: "space-between" }}>
      <span style={{ display: "flex", gap: 8 }}>
        {mod && <button type="button" className="btn btn-danger" aria-label="Delete activity" onClick={remove}><Icon n="trash" s={16} /></button>}
        {place && <button type="button" className="btn btn-ghost" onClick={unschedule}><Icon n="x" s={16} />Unschedule</button>}
        {a.branch && editable(t) && <button type="button" className="btn btn-ghost" onClick={toVoting}><Icon n="vote" s={16} />Back to voting</button>}
      </span>
      <button type="button" className="btn btn-outline" aria-label="Comments" onClick={() => peek.idea(a.id)}><Icon n="msg" s={16} />Details · {a.commentCount}</button>
    </div>
  </>;
}

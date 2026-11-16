import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createActivityComment, deleteActivityComment, deleteActivityPreference, type ActivityResponse, fetchActivityComments, fetchActivityPreferences, saveActivityPreference, updateActivity,
  type ActivityComment, type ActivityPreferencesResponse } from "../api/activityApi";
import { uploadActivityImage } from "../api/communityApi";
import { apiErrorMessage } from "../api/apiError";
import { useMe, useTrip } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { Avatar, Chip, Empty, FieldErr, Icon, LoadError, Spinner, Stack } from "../ui/kit";
import { DlgHead } from "../ui/Overlay";
import { catIcon, catKey, chipOf, editable, ideaKind, isOwner, isScheduled, toneOf } from "../lib/domain";
import { ago, daysBetween, fd, fwd, hm } from "../lib/format";
import { removeActivity, unbranch } from "../lib/actions";
import type { Jump } from "../lib/timeline";
import Photo, { Thumb } from "./Photo";
import { SlotPicker, type Slot } from "./SlotPicker";
import IdeaForm from "./IdeaForm";
import { Attachments } from "./TripFiles";
import { usePeek } from "./usePeek";

/** Pick one preferred time in its own window, above the activity; saving hands the new preferences back. */
function PreferenceDialog({ a, mine, onSaved }: { a: ActivityResponse; mine: string[]; onSaved: (p: ActivityPreferencesResponse) => void }) {
  const { trip: t } = useTrip(), o = useOverlay();
  const [v, setV] = useState<Slot>({ date: t.startDate, start: "10:00", end: "12:00" }), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(""); setBusy(true);
    try { onSaved(await saveActivityPreference(a.id, { preferredDate: v.date, preferredStartTime: v.start, preferredEndTime: v.end })); o.closeDialog(); o.toast("Preferred time saved"); }
    catch (ex) { setErr(apiErrorMessage(ex, "Preference not saved")); } finally { setBusy(false); }
  };
  return <div className="dlg-body">
    <DlgHead title={<><Icon n="clock" s={20} /> Preferred time</>} onClose={o.closeDialog} />
    <SlotPicker days={daysBetween(t.startDate, t.endDate)} value={v} onChange={setV} />
    <FieldErr msg={err} />
    <div className="dlg-foot"><button type="button" className="btn btn-ghost" onClick={o.closeDialog}>Cancel</button>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={save}><Icon n="check" s={16} />{mine.includes(v.date) ? "Update" : "Save"}</button></div>
  </div>;
}

/**
 * One activity. Beside the photo: what it is, where, and the three facts that decide what happens next (when, the
 * votes or who's going, and preferred times). Under the photo: the description; then the comments.
 */
export default function IdeaDrawer({ id }: { id: number }) {
  const store = useTrip(), me = useMe(), o = useOverlay(), peek = usePeek(), nav = useNavigate();
  const a = store.activities.find((x) => x.id === id), t = store.trip;
  const [pi, setPi] = useState(0), [prefs, setPrefs] = useState<ActivityPreferencesResponse | null>(null), [comments, setComments] = useState<ActivityComment[] | null>(null);
  const [text, setText] = useState(""), [busy, setBusy] = useState("");
  const [commentsErr, setCommentsErr] = useState(""), [commentsTry, setCommentsTry] = useState(0);
  useEffect(() => { fetchActivityPreferences(id).then(setPrefs).catch(() => undefined); }, [id]);
  useEffect(() => { fetchActivityComments(id).then(setComments).catch((e) => setCommentsErr(apiErrorMessage(e, "Couldn't load the comments."))); }, [id, commentsTry]);
  if (!a) return <Empty icon="alert" text="This activity was removed" />;
  const k = ideaKind(a), photos = a.imageUrls, mod = a.canModify && editable(t), [label, cls, icon] = chipOf(a);
  const addPhoto = async (f?: File) => {
    if (!f) return; setBusy("photo");
    try { const url = await uploadActivityImage(f); store.putActivities([await updateActivity(a.id, { name: a.name, location: a.location, category: a.category, description: a.description, tags: a.tags, imageUrls: [...photos, url], date: a.date, startTime: a.startTime, endTime: a.endTime })]); setPi(photos.length); }
    catch (e) { o.toast(apiErrorMessage(e, "Photo not uploaded")); } finally { setBusy(""); }
  };
  const dropPref = async (date: string) => { try { setPrefs(await deleteActivityPreference(a.id, date)); } catch (e) { o.toast(apiErrorMessage(e, "Not removed")); } };
  const post = async (e: React.FormEvent) => {
    e.preventDefault(); const c = text.trim(); if (!c || busy) return;
    setBusy("post");
    try { const r = await createActivityComment(a.id, c); setComments((l) => [...(l ?? []), r]); setText(""); store.refreshActivities(); }
    catch (ex) { o.toast(apiErrorMessage(ex, "Comment not posted")); } finally { setBusy(""); }
  };
  const dropComment = async (c: ActivityComment) => {
    if (!(await o.confirm({ title: "Delete this comment?", body: "It's removed for everyone on the trip.", label: "Delete", danger: true }))) return;
    try { await deleteActivityComment(a.id, c.id); setComments((l) => (l ?? []).filter((x) => x.id !== c.id)); store.refreshActivities(); }
    catch (ex) { o.toast(apiErrorMessage(ex, "Comment not deleted")); }
  };
  const remove = async () => { if (await removeActivity(store, o, a)) o.closeDrawer(); };
  const toVoting = async () => { if (await unbranch(store, o, a)) o.closeDrawer(); };
  const mine = prefs?.currentUserPreferences ?? [];
  /* Scheduled: open its event. Waiting to be scheduled: open the most-preferred time (else the first day). */
  const best = [...(prefs?.slots ?? [])].filter((s) => s.preferredStartTime).sort((x, y) => y.memberCount - x.memberCount)[0];
  const openSchedule = () => {
    const jump: Jump = isScheduled(a) ? { focus: a.id, day: a.date!, time: hm(a.startTime), scheduled: true }
      : { focus: a.id, day: best?.preferredDate ?? t.startDate, time: best ? hm(best.preferredStartTime) : undefined, scheduled: false };
    o.closeDrawer(); nav(`/trip/${t.tripId}/schedule`, { state: jump });
  };
  const canPrefer = k !== "rejected" && editable(t), placeable = (k === "approved" || k === "branch") && editable(t);
  return <>
    <div className="dlg-head"><span className="peek-chips"><Chip text={label} cls={cls} icon={icon} /><Chip text={a.category} cls={"cat-" + catKey(a.category)} icon={catIcon(a.category)} />
      {a.tags.map((g) => <Chip key={g} text={"#" + g} />)}</span>
      <button type="button" className="icon-btn" aria-label="Close" onClick={o.closeDrawer}><Icon n="x" s={20} /></button></div>
    <div className="peek-grid idea-peek">
      <div className="peek-col">
        <Photo src={photos[Math.min(pi, photos.length - 1)]} category={a.category} tone={toneOf(a.id)} big={photos.length > 0} />
        {(photos.length > 1 || mod) && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {photos.map((p, i) => <button key={p} type="button" aria-pressed={i === pi} aria-label={"Photo " + (i + 1)} onClick={() => setPi(i)}
            style={{ border: 0, padding: 0, borderRadius: 10, overflow: "hidden", opacity: i === pi ? 1 : 0.55, boxShadow: i === pi ? "0 0 0 2px var(--primary)" : "none", transition: "opacity 150ms ease" }}><Thumb src={p} tone={toneOf(a.id)} size={[58, 44]} /></button>)}
          {mod && photos.length < 8 && <label className="icon-btn" style={{ width: 58, height: 44, background: "var(--field)", cursor: "pointer" }} aria-label="Add photo">{busy === "photo" ? <Spinner /> : <Icon n="plus" />}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ""; }} /></label>}
        </div>}
        {a.description && <div className="peek-desc"><p>{a.description}</p></div>}
      </div>
      <div className="peek-col">
        <div className="peek-title"><h2>{a.name}</h2>
          <div className="meta full" style={{ marginTop: 8 }}><Icon n="pin" s={14} /><span>{a.location || a.category}</span></div>
          <div className="meta" style={{ marginTop: 8 }}><Avatar id={a.createdById} name={a.createdByUsername} onClick={() => peek.person(a.createdById, a.createdByUsername)} />{a.createdByUsername} · {ago(a.createdAt)}</div></div>
        <div className="facts">
          {a.branch && <div className="fact"><span className="fact-ico branch"><Icon n="branch" s={17} /></span>
            <span className="fact-txt"><small>Going</small>{a.memberIds.length ? <Stack people={a.memberIds.map((m) => ({ id: m, name: store.name(m) }))} max={6} /> : <b className="muted">Nobody yet</b>}</span>
            {editable(t) && <button type="button" className="btn btn-ghost btn-sm" onClick={toVoting}><Icon n="vote" s={15} />Back to voting</button>}</div>}
          {/* One "when" row: the time once it's set; until then the preferred times, and Schedule when it can be placed. Votes stay on the card. */}
          {isScheduled(a) || !canPrefer ? <div className="fact"><span className="fact-ico"><Icon n="cal" s={17} /></span>
            <span className="fact-txt"><small>When</small>{isScheduled(a) ? <b className="num">{fwd(a.date!)} {fd(a.date!)} · {hm(a.startTime)}–{hm(a.endTime)}</b> : <b className="muted">Not scheduled</b>}</span>
            {isScheduled(a) ? <button type="button" className="icon-btn sm" aria-label="Open in the schedule" onClick={openSchedule}><Icon n="arrow" s={16} /></button>
              : placeable && <button type="button" className="btn btn-primary btn-sm" onClick={openSchedule}><Icon n="cal" s={15} />Schedule</button>}</div>
            : <div className="fact fact-col">
            <div className="fact-top"><span className="fact-ico"><Icon n="clock" s={17} /></span>
              <span className="fact-txt"><small>Preferred times</small>{!mine.length && <b className="muted">None yet</b>}</span>
              <span className="pref-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => o.dialog(<PreferenceDialog a={a} mine={mine.map((p) => p.preferredDate)} onSaved={setPrefs} />)}><Icon n="plus" s={15} />Add</button>
              {placeable && <button type="button" className="btn btn-primary btn-sm" onClick={openSchedule}><Icon n="cal" s={15} />Schedule</button>}</span></div>
            {mine.length > 0 && <div className="pills">{mine.map((p) => <span key={p.preferenceId} className="chip c-blue pref-chip num">{fwd(p.preferredDate)} {fd(p.preferredDate)}{p.preferredStartTime && ` · ${hm(p.preferredStartTime)}–${hm(p.preferredEndTime)}`}
              <button type="button" aria-label="Remove time" onClick={() => dropPref(p.preferredDate)}><Icon n="x" s={12} /></button></span>)}</div>}
          </div>}
          <Attachments activity={a} />
        </div>
        <section><h3 style={{ marginBottom: 6 }}>Comments<span className="n num">{comments?.length ?? a.commentCount}</span></h3>
          {commentsErr && !comments && <LoadError compact text={commentsErr} onRetry={() => { setCommentsErr(""); setCommentsTry((n) => n + 1); }} />}
          {comments?.map((c) => <div key={c.id} className="list-row" style={{ alignItems: "flex-start" }}><Avatar id={c.authorId} name={c.authorUsername} onClick={() => peek.person(c.authorId, c.authorUsername)} />
            <span style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{c.authorUsername}</b> <span className="hint num">{ago(c.createdAt)}</span><span style={{ display: "block", color: "var(--ink-2)" }}>{c.content}</span></span>
            {(c.authorId === me.userId || isOwner(t)) && <button type="button" className="icon-btn" aria-label="Delete comment" onClick={() => dropComment(c)}><Icon n="trash" s={15} /></button>}</div>)}
          <form style={{ display: "flex", gap: 8, marginTop: 8 }} onSubmit={post}><input className="input" maxLength={2000} placeholder="Add a comment" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn btn-solid" aria-label="Post" disabled={busy === "post"}>{busy === "post" ? <Spinner s={17} /> : <Icon n="arrow" s={17} />}</button></form></section>
      </div>
    </div>
    {mod && <div className="dlg-foot" style={{ justifyContent: "space-between" }}>
      <button type="button" className="btn btn-danger" onClick={remove}><Icon n="trash" s={16} />Delete</button>
      <button type="button" className="btn btn-outline" onClick={() => o.dialog(<IdeaForm edit={a} />, { wide: true })}><Icon n="edit" s={16} />Edit</button></div>}
  </>;
}

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ANNOUNCEMENT_CONTENT_MAX, ANNOUNCEMENT_TITLE_MAX, createAnnouncement, deleteAnnouncement, fetchAnnouncements, updateAnnouncement, type Announcement } from "../api/announcementApi";
import { apiErrorMessage } from "../api/apiError";
import { useTrip } from "../lib/stores";
import { useLoad } from "../lib/useLoad";
import { editable, isOwner } from "../lib/domain";
import { ago, fdt } from "../lib/format";
import { useOverlay } from "../ui/overlayContext";
import { DlgHead } from "../ui/Overlay";
import { Avatar, Chip, Empty, FieldErr, Icon, LoadError, Spinner } from "../ui/kit";
import { usePeek } from "./usePeek";

/* FR-19: trip announcements. Owners post, edit and remove them; every joined member reads them, newest first.
   Like plans and expenses they become read-only once the trip is archived. */

const SHOWN = 3;
/** Posted in the last day: marked "New" so it stands out on the overview. */
const fresh = (a: Announcement) => Date.now() - new Date(a.publishedAt).getTime() < 86_400_000;
const onEnter = (go: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };

function Row({ a, full, onOpen }: { a: Announcement; full?: boolean; onOpen: () => void }) {
  const peek = usePeek();
  return <article className={"ann" + (full ? " full" : "")} role="button" tabIndex={0} aria-label={`${a.title}, by ${a.authorName}`} onClick={onOpen} onKeyDown={onEnter(onOpen)}>
    <Avatar id={a.authorId} name={a.authorName} onClick={() => peek.person(a.authorId, a.authorName)} />
    <div className="ann-main">
      <div className="ann-top"><b className="ann-title">{a.title}</b>{fresh(a) && <Chip text="New" cls="c-blue" />}<span className="hint num" title={fdt(a.publishedAt)}>{ago(a.publishedAt)}</span></div>
      <p className="ann-text">{a.content}</p>
      <span className="ann-by">{a.authorName}{a.edited && " · edited"}</span>
    </div>
  </article>;
}

/** One announcement in full. Owners can edit or delete it from here. */
function View({ a, onChanged }: { a: Announcement; onChanged: () => void }) {
  const { trip } = useTrip(), o = useOverlay(), peek = usePeek();
  const manage = a.canManage && editable(trip);
  const reopen = () => o.dialog(<View a={a} onChanged={onChanged} />);
  const remove = async () => {
    if (!(await o.confirm({ title: "Delete this announcement?", body: `“${a.title}” is removed for everyone.`, label: "Delete", danger: true }))) { reopen(); return; }
    try { await deleteAnnouncement(trip.tripId, a.announcementId); onChanged(); o.toast("Announcement deleted"); }
    catch (e) { o.toast(apiErrorMessage(e, "Announcement not deleted")); onChanged(); }
  };
  return <div className="dlg-body">
    <DlgHead title={a.title} onClose={o.closeDialog} />
    <div className="meta ann-meta"><Avatar id={a.authorId} name={a.authorName} onClick={() => { o.closeDialog(); peek.person(a.authorId, a.authorName); }} />
      <b style={{ color: "var(--ink)" }}>{a.authorName}</b><span className="num">· {fdt(a.publishedAt)}</span>{a.edited && <span className="num">· edited {fdt(a.updatedAt)}</span>}</div>
    <p className="ann-full">{a.content}</p>
    {manage && <div className="dlg-foot">
      <button type="button" className="btn btn-danger" style={{ marginRight: "auto" }} onClick={remove}><Icon n="trash" s={16} />Delete</button>
      <button type="button" className="btn btn-outline" onClick={() => o.dialog(<Compose edit={a} onSaved={onChanged} />)}><Icon n="edit" s={16} />Edit</button></div>}
  </div>;
}

/** Post a new announcement, or edit one (it keeps its publish time and is marked edited). */
function Compose({ edit, onSaved }: { edit?: Announcement; onSaved: () => void }) {
  const { trip } = useTrip(), o = useOverlay();
  const [title, setTitle] = useState(edit?.title ?? ""), [content, setContent] = useState(edit?.content ?? "");
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { title: title.trim(), content: content.trim() };
    if (!body.title) return setErr("Add a title");
    if (!body.content) return setErr("Write the announcement");
    setBusy(true); setErr("");
    try {
      if (edit) await updateAnnouncement(trip.tripId, edit.announcementId, body); else await createAnnouncement(trip.tripId, body);
      onSaved(); o.closeDialog(); o.toast(edit ? "Announcement updated" : "Announcement posted");
    } catch (ex) { setErr(apiErrorMessage(ex, edit ? "Changes not saved" : "Announcement not posted")); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} noValidate>
    <DlgHead title={edit ? "Edit announcement" : "New announcement"} onClose={o.closeDialog} />
    <label className="field">Title <small className="num">{title.length}/{ANNOUNCEMENT_TITLE_MAX}</small>
      <input className="input" maxLength={ANNOUNCEMENT_TITLE_MAX} autoFocus placeholder="Flight time changed" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    <label className="field">Message <small className="num">{content.length}/{ANNOUNCEMENT_CONTENT_MAX}</small>
      <textarea className="input" rows={6} maxLength={ANNOUNCEMENT_CONTENT_MAX} placeholder="What does everyone need to know?" value={content} onChange={(e) => setContent(e.target.value)} /></label>
    {!edit && <p className="hint" style={{ margin: 0 }}><Icon n="users" s={13} /> Everyone in {trip.name} sees this at the top of the overview.</p>}
    <FieldErr msg={err} />
    <div className="dlg-foot"><button type="button" className="btn btn-ghost" onClick={o.closeDialog}>Cancel</button>
      <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner s={16} /> : <Icon n={edit ? "check" : "megaphone"} s={16} />}{edit ? "Save" : "Post"}</button></div>
  </form>;
}

function All({ list, onChanged }: { list: Announcement[]; onChanged: () => void }) {
  const o = useOverlay();
  return <div className="dlg-body">
    <DlgHead title={<>Announcements<span className="n num">{list.length}</span></>} onClose={o.closeDialog} />
    <div className="ann-list">{list.map((a) => <Row key={a.announcementId} a={a} full onOpen={() => o.dialog(<View a={a} onChanged={onChanged} />)} />)}</div>
  </div>;
}

export default function Announcements() {
  const { trip: t } = useTrip(), o = useOverlay();
  const { data: list, error, retry } = useLoad(() => fetchAnnouncements(t.tripId), [t.tripId], "Couldn't load the announcements.");
  const canPost = isOwner(t) && editable(t);
  const compose = () => o.dialog(<Compose onSaved={retry} />);
  return <section className="card pad ws-card ann-card" aria-label="Announcements">
    <div className="sec-head"><h3><Icon n="megaphone" s={17} /> Announcements{!!list?.length && <span className="n num">{list.length}</span>}</h3>
      {canPost && <button type="button" className="btn btn-primary btn-sm" onClick={compose}><Icon n="plus" s={15} />New</button>}</div>
    {error && !list ? <LoadError compact text={error} onRetry={retry} />
      : !list ? <div className="sk-list" aria-hidden="true">{[62, 78, 48].map((w) => <div key={w} className="sk-row"><i className="sk-av" /><span><i style={{ width: w + "%" }} /><i style={{ width: w / 2 + "%" }} /></span></div>)}</div>
      : !list.length ? <Empty icon="megaphone" text={canPost ? "Share news the whole group needs to see" : "No announcements yet"}>
          {canPost && <button type="button" className="btn btn-outline btn-sm" onClick={compose}><Icon n="plus" s={15} />Post the first one</button>}</Empty>
      : <div className="ann-list">{list.slice(0, SHOWN).map((a) => <Row key={a.announcementId} a={a} onOpen={() => o.dialog(<View a={a} onChanged={retry} />)} />)}</div>}
    {list && list.length > SHOWN && <button type="button" className="btn btn-ghost btn-sm ws-more" onClick={() => o.dialog(<All list={list} onChanged={retry} />, { wide: true })}>
      See all {list.length}<Icon n="arrow" s={14} /></button>}
  </section>;
}

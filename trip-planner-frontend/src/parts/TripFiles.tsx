import { useRef, useState, type DragEvent, type MouseEvent } from "react";
import { deleteTripFile, TRIP_FILE_ACCEPT, uploadTripFile, type TripFile } from "../api/tripFileApi";
import type { ActivityResponse } from "../api/activityApi";
import { apiErrorMessage } from "../api/apiError";
import { useTrip } from "../lib/stores";
import { editable } from "../lib/domain";
import { ago, fd, fdt, fwd } from "../lib/format";
import { fileLabel, fileProblem, fileSize, filesChanged, forgetFile, isImage, isPdf, saveFile, useFileUrl, useTripFiles } from "../lib/tripFiles";
import { useOverlay, type Overlay } from "../ui/overlayContext";
import { DlgHead } from "../ui/Overlay";
import { Avatar, Empty, Icon, LoadError, Seg, Spinner } from "../ui/kit";
import { usePeek } from "./usePeek";

/* FR-18: trip files. Every member can upload PDFs and images (to the whole trip or one activity), view and download
   them; the uploader or an owner can delete one. Like plans and expenses, files are read-only once the trip is
   archived. The Overview card is the central place to find them; each activity's drawer lists its own. */

const TILES = 4;
/* Browser PDF viewer: no toolbar or thumbnail sidebar (they squeezed the page into half the width; Download is below) and fit the page width. */
const PDF_VIEW = "#toolbar=0&navpanes=0&view=FitH";
const within = (e: MouseEvent) => (e.currentTarget as Element).closest("dialog");

/** An image's own picture (fetched with the sign-in token), or a tinted tile with its type for PDFs. */
export function FileThumb({ f, small }: { f: TripFile; small?: boolean }) {
  const { url } = useFileUrl(isImage(f) ? f : null);
  return <span className={"file-thumb" + (small ? " sm" : "") + (isPdf(f) ? " pdf" : "")} aria-hidden="true">
    {url ? <img src={url} alt="" /> : <><Icon n={isImage(f) ? "image" : "file"} s={small ? 17 : 24} /><b>{fileLabel(f)}</b></>}
  </span>;
}

/** Which drawer shows an activity: a scheduled plan or an idea still being voted on. */
function openActivity(o: Overlay, peek: ReturnType<typeof usePeek>, a: ActivityResponse | undefined) {
  if (!a) return;
  o.closeDialog();
  if (a.date && a.startTime) peek.plan(a.id); else peek.idea(a.id);
}

/** Preview a file (image or the browser's PDF viewer) with who uploaded it and when, then download or delete it. */
function Preview({ f, onBack, reopen, afterDelete }: { f: TripFile; onBack?: () => void; reopen: () => void; afterDelete?: () => void }) {
  const { trip, activities } = useTrip(), o = useOverlay(), peek = usePeek();
  const [attempt, setAttempt] = useState(0);
  const { url, failed } = useFileUrl(f, attempt);
  const act = activities.find((a) => a.id === f.activityId);
  const remove = async () => {
    if (!(await o.confirm({ title: `Delete ${f.fileName}?`, body: "It's removed for everyone in the trip.", label: "Delete", danger: true }))) { reopen(); return; }
    try { await deleteTripFile(trip.tripId, f.fileId); forgetFile(f); filesChanged(trip.tripId); o.toast("Deleted " + f.fileName); afterDelete?.(); }
    catch (e) { o.toast(apiErrorMessage(e, "File not deleted")); filesChanged(trip.tripId); afterDelete?.(); }
  };
  return <div className="dlg-body fp">
    <div className="dlg-head">
      {onBack && <button type="button" className="icon-btn" aria-label="Back to all files" onClick={onBack}><Icon n="left" s={20} /></button>}
      <h2 className="fp-title" title={f.fileName}>{f.fileName}</h2>
      <button type="button" className="icon-btn" onClick={o.closeDialog} aria-label="Close"><Icon n="x" s={20} /></button></div>
    <div className={"fp-stage" + (isPdf(f) ? " doc" : "")}>
      {url ? (isPdf(f) ? <iframe src={url + PDF_VIEW} title={"Preview of " + f.fileName} /> : <img src={url} alt={f.fileName} />)
        : failed ? <LoadError compact text="Couldn't open this file." onRetry={() => { forgetFile(f); setAttempt((n) => n + 1); }} /> : <Spinner s={26} />}
    </div>
    <div className="fp-meta">
      <span className="meta"><Avatar id={f.uploaderId} name={f.uploaderName} size={26} /><b style={{ color: "var(--ink)" }}>{f.uploaderName}</b><span className="num">· {fdt(f.uploadedAt)}</span></span>
      <span className="meta num"><Icon n="file" s={14} />{fileLabel(f)} · {fileSize(f.sizeBytes)}</span>
      {f.activityId ? <button type="button" className="fp-act" onClick={() => openActivity(o, peek, act)} disabled={!act}><Icon n="pin" s={14} />{f.activityName}{act && <Icon n="arrow" s={14} />}</button>
        : <span className="meta"><Icon n="grid" s={14} />Whole trip</span>}
    </div>
    <div className="dlg-foot">
      {f.canDelete && editable(trip) && <button type="button" className="btn btn-danger" style={{ marginRight: "auto" }} onClick={remove}><Icon n="trash" s={16} />Delete</button>}
      <button type="button" className="btn btn-primary" onClick={(e) => { const box = within(e); saveFile(f, box).catch(() => o.toast("Couldn't download this file")); }}><Icon n="download" s={16} />Download</button>
    </div>
  </div>;
}

/** Opens a file's preview on its own; cancelling a delete brings the preview back. */
function openPreview(o: Overlay, f: TripFile) {
  const show = () => o.dialog(<Preview f={f} reopen={show} />, { wide: true });
  show();
}

interface Pick { file: File; problem: string; state: "" | "busy" | "done" | "error"; msg?: string }
const picked = (file: File): Pick => ({ file, problem: fileProblem(file), state: "" });

/** Upload one or more files, dropped or chosen, to the whole trip or to one activity. */
function Upload({ activityId, initial = [] }: { activityId?: number; initial?: File[] }) {
  const { trip, activities } = useTrip(), o = useOverlay();
  const [items, setItems] = useState<Pick[]>(() => initial.map(picked));
  const [link, setLink] = useState(activityId ? String(activityId) : "");
  const [busy, setBusy] = useState(false), [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fixed = activityId ? activities.find((a) => a.id === activityId) : undefined;
  const options = [...activities].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.name.localeCompare(b.name));
  const add = (list: FileList | File[]) => setItems((cur) => [...cur.filter((x) => x.state !== "done"), ...Array.from(list).map(picked)].slice(0, 10));
  const ready = items.filter((x) => !x.problem && x.state !== "done");
  const mark = (file: File, state: Pick["state"], msg?: string) => setItems((cur) => cur.map((x) => (x.file === file ? { ...x, state, msg } : x)));
  const drop = (e: DragEvent) => { e.preventDefault(); setDrag(false); if (!busy && e.dataTransfer.files.length) add(e.dataTransfer.files); };
  const upload = async () => {
    if (!ready.length || busy) return;
    setBusy(true);
    let done = 0;
    for (const x of ready) {
      mark(x.file, "busy");
      try { await uploadTripFile(trip.tripId, x.file, link ? Number(link) : null); mark(x.file, "done"); done++; }
      catch (e) { mark(x.file, "error", apiErrorMessage(e, "Not uploaded")); }
    }
    setBusy(false);
    if (done) filesChanged(trip.tripId);
    if (done === ready.length) { o.closeDialog(); o.toast(done === 1 ? "Uploaded " + ready[0].file.name : `Uploaded ${done} files`); }
  };
  return <div className="dlg-body">
    <DlgHead title={fixed ? "Attach files" : "Upload files"} onClose={o.closeDialog} />
    <div className={"drop" + (drag ? " on" : "")} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={drop}>
      <span className="drop-ico"><Icon n="upload" s={22} /></span>
      <b>Drop PDFs or photos here</b>
      <span className="hint">Tickets, bookings and passes · up to 10 MB each</span>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => input.current?.click()}><Icon n="paperclip" s={15} />Choose files</button>
      <input ref={input} type="file" multiple accept={TRIP_FILE_ACCEPT} hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
    </div>
    {items.length > 0 && <div className="up-list">{items.map((x, i) => <div key={i + x.file.name} className={"list-row up-row" + (x.problem || x.state === "error" ? " bad" : "")}>
      <span className="up-ico"><Icon n={x.file.type.startsWith("image/") ? "image" : "file"} s={17} /></span>
      <span className="up-name"><b>{x.file.name}</b><small className="num">{x.problem || (x.state === "error" ? x.msg : fileSize(x.file.size))}</small></span>
      {x.state === "busy" ? <Spinner s={18} /> : x.state === "done" ? <span className="up-ok"><Icon n="check" s={17} /></span>
        : !busy && <button type="button" className="icon-btn sm" aria-label={"Remove " + x.file.name} onClick={() => setItems((cur) => cur.filter((y) => y !== x))}><Icon n="x" s={15} /></button>}
    </div>)}</div>}
    {fixed ? <div className="up-to"><Icon n="pin" s={15} />Attaching to <b>{fixed.name}</b></div>
      : <label className="field">Attach to<select className="input" value={link} disabled={busy} onChange={(e) => setLink(e.target.value)}>
          <option value="">Whole trip</option>
          {options.map((a) => <option key={a.id} value={a.id}>{a.name}{a.date ? ` · ${fwd(a.date)} ${fd(a.date)}` : ""}</option>)}</select>
        <small>Optional: link a ticket or booking to the plan it's for</small></label>}
    <div className="dlg-foot"><button type="button" className="btn btn-ghost" onClick={o.closeDialog}>{items.some((x) => x.state === "done") ? "Close" : "Cancel"}</button>
      <button type="button" className="btn btn-primary" disabled={!ready.length || busy} onClick={upload}>{busy ? <Spinner s={16} /> : <Icon n="upload" s={16} />}
        {ready.length > 1 ? `Upload ${ready.length} files` : "Upload"}</button></div>
  </div>;
}

/** One file as a list row: thumbnail, name, where it belongs and who added it; the download button saves it directly. */
function FileRow({ f, onOpen, showActivity = true }: { f: TripFile; onOpen: () => void; showActivity?: boolean }) {
  const o = useOverlay();
  return <div className="list-row file-row" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}>
    <FileThumb f={f} small />
    <span className="file-row-main"><b title={f.fileName}>{f.fileName}</b>
      <small className="num">{showActivity && <>{f.activityName ?? "Whole trip"} · </>}{fileSize(f.sizeBytes)} · {f.uploaderName} · {ago(f.uploadedAt)}</small></span>
    <button type="button" className="icon-btn sm" aria-label={"Download " + f.fileName} onClick={(e) => { e.stopPropagation(); saveFile(f, within(e)).catch(() => o.toast("Couldn't download this file")); }}><Icon n="download" s={16} /></button>
  </div>;
}

type Filter = "all" | "trip" | "plans";
/** Every file in the trip, grouped by the plan it belongs to, with a search; opening one shows it in place. */
function AllFiles({ start }: { start?: TripFile }) {
  const { trip, activities } = useTrip(), o = useOverlay();
  const { data: files, error, retry } = useTripFiles(trip.tripId);
  const [filter, setFilter] = useState<Filter>("all"), [q, setQ] = useState(""), [sel, setSel] = useState<TripFile | null>(start ?? null);
  if (sel) {
    // A delete confirmation replaces this dialog: cancelling brings the preview back, deleting returns to the list.
    return <Preview f={sel} onBack={() => setSel(null)} reopen={() => o.dialog(<AllFiles start={sel} />, { wide: true })} afterDelete={() => o.dialog(<AllFiles />, { wide: true })} />;
  }
  const term = q.trim().toLowerCase();
  const shown = (files ?? []).filter((f) => (filter === "all" || (filter === "trip") === !f.activityId)
    && (!term || f.fileName.toLowerCase().includes(term) || (f.activityName ?? "whole trip").toLowerCase().includes(term) || f.uploaderName.toLowerCase().includes(term)));
  /* Whole-trip files first, then each plan in calendar order. */
  const when = (id: number | null) => { const a = activities.find((x) => x.id === id); return id == null ? "" : (a?.date ?? "9999") + (a?.startTime ?? ""); };
  const groups: [string, TripFile[]][] = [];
  [...shown].sort((a, b) => when(a.activityId).localeCompare(when(b.activityId))).forEach((f) => {
    const name = f.activityName ?? "Whole trip", g = groups.find((x) => x[0] === name);
    if (g) g[1].push(f); else groups.push([name, [f]]);
  });
  const count = (k: Filter) => (files ?? []).filter((f) => k === "all" || (k === "trip") === !f.activityId).length;
  return <div className="dlg-body files-dlg">
    <DlgHead title={<>Files{files && <span className="n num">{files.length}</span>}</>} onClose={o.closeDialog} />
    <div className="files-tools">
      <Seg name="fileFilter" value={filter} onChange={setFilter} options={[["all", "All", count("all")], ["trip", "Whole trip", count("trip")], ["plans", "Plans", count("plans")]]} />
      <span className="input-ico files-search"><Icon n="search" s={17} /><input className="input" type="search" placeholder="Search files" aria-label="Search files" value={q} onChange={(e) => setQ(e.target.value)} /></span>
    </div>
    {error && !files ? <LoadError compact text={error} onRetry={retry} /> : !files ? <div className="empty"><Spinner /></div>
      : !shown.length ? <Empty icon="search" text={files.length ? "No files match" : "No files yet"} />
      : <div className="file-groups">{groups.map(([name, list]) => <section key={name}><h4>{name}<span className="hint num">{list.length}</span></h4>
          {list.map((f) => <FileRow key={f.fileId} f={f} showActivity={false} onOpen={() => setSel(f)} />)}</section>)}</div>}
  </div>;
}

/** Overview card: the trip's latest files as tiles, the central place to find every ticket and booking. */
export default function TripFiles() {
  const { trip: t } = useTrip(), o = useOverlay();
  const { data: files, error, retry } = useTripFiles(t.tripId);
  const can = editable(t);
  const [drag, setDrag] = useState(false);
  const all = () => o.dialog(<AllFiles />, { wide: true });
  const more = files && files.length > TILES ? files.length - (TILES - 1) : 0;
  const tiles = files ? files.slice(0, more ? TILES - 1 : TILES) : [];
  return <section className={"card pad ws-card files-card" + (drag ? " dropping" : "")} aria-label="Files"
    onDragOver={can ? (e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } } : undefined}
    onDragLeave={() => setDrag(false)}
    onDrop={can ? (e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) o.dialog(<Upload initial={Array.from(e.dataTransfer.files)} />); } : undefined}>
    <div className="sec-head"><h3><Icon n="paperclip" s={17} /> Files{!!files?.length && <span className="n num">{files.length}</span>}</h3>
      {can && <button type="button" className="btn btn-primary btn-sm" onClick={() => o.dialog(<Upload />)}><Icon n="upload" s={15} />Upload</button>}</div>
    {error && !files ? <LoadError compact text={error} onRetry={retry} />
      : !files ? <div className="sk-grid" aria-hidden="true">{["image", "file", "paperclip", "image"].map((n, i) => <div key={i} className="sk-tile"><Icon n={n} s={18} /><i /></div>)}</div>
      : !files.length ? <Empty icon="paperclip" text={can ? "Keep tickets, bookings and passes in one place" : "No files yet"}>
          {can && <button type="button" className="btn btn-outline btn-sm" onClick={() => o.dialog(<Upload />)}><Icon n="upload" s={15} />Upload the first one</button>}</Empty>
      : <div className="file-grid">
          {tiles.map((f) => <button key={f.fileId} type="button" className="file-tile" title={f.fileName} onClick={() => openPreview(o, f)}>
            <FileThumb f={f} /><span className="file-name">{f.fileName}</span><span className="file-sub">{f.activityName ?? "Whole trip"}</span></button>)}
          {more > 0 && <button type="button" className="file-tile" onClick={all}><span className="file-thumb more"><b className="num">+{more}</b></span><span className="file-name">See all</span><span className="file-sub">{files.length} files</span></button>}
        </div>}
    {files && files.length > 0 && !more && <button type="button" className="btn btn-ghost btn-sm ws-more" onClick={all}>Browse files<Icon n="arrow" s={14} /></button>}
    {drag && <div className="drop-veil" aria-hidden="true"><Icon n="upload" s={22} />Drop to upload</div>}
  </section>;
}

/** The plan and idea drawers: one row in their list of facts, with the activity's files and a button to attach more. */
export function Attachments({ activity }: { activity: ActivityResponse }) {
  const { trip: t } = useTrip(), o = useOverlay();
  const { data: files, error, retry } = useTripFiles(t.tripId, activity.id);
  const can = editable(t);
  return <div className="fact fact-col" aria-label="Files">
    <div className="fact-top"><span className="fact-ico"><Icon n="paperclip" s={17} /></span>
      <span className="fact-txt"><small>Files{files && " · " + files.length}</small>{files && !files.length && <b className="muted">None yet</b>}</span>
      {can && <button type="button" className="btn btn-ghost btn-sm" onClick={() => o.dialog(<Upload activityId={activity.id} />)}><Icon n="plus" s={15} />Attach</button>}</div>
    {error && !files && <LoadError compact text={error} onRetry={retry} />}
    {files?.map((f) => <button key={f.fileId} type="button" className="fact-item file-fact" title={f.fileName} onClick={() => openPreview(o, f)}>
      <FileThumb f={f} small /><span className="fact-item-txt"><b>{f.fileName}</b><small className="num">{fileLabel(f)} · {fileSize(f.sizeBytes)} · {f.uploaderName} · {ago(f.uploadedAt)}</small></span>
      <Icon n="arrow" s={15} className="muted" /></button>)}
  </div>;
}

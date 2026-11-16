import { useState, type FormEvent, type KeyboardEvent } from "react";
import { createActivity, updateActivity, type ActivityResponse } from "../api/activityApi";
import { createBranchPlan } from "../api/branchPlanningApi";
import { fetchPlacePhoto, getPlaceRecommendation, searchPlaces, type PlaceResult } from "../api/discoverApi";
import { uploadActivityImage } from "../api/communityApi";
import { apiErrorMessage } from "../api/apiError";
import { useApp, useTrip } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { DlgHead } from "../ui/Overlay";
import { Chip, Empty, FieldErr, Icon, Spinner } from "../ui/kit";
import { CATEGORIES, catIcon, catKey, family } from "../lib/domain";
import { daysBetween, fd, fwd, hm } from "../lib/format";
import { Thumb } from "./Photo";
import PlaceMap from "./map/PlaceMap";

interface Draft { name: string; location: string; category: string; description: string; date: string; startTime: string; endTime: string; tags: string[]; imageUrls: string[]; latitude: number | null; longitude: number | null }
const TYPE_CAT: Record<string, string> = { restaurant: "Food", bakery: "Food", cafe: "Food", bar: "Food", park: "Nature", national_park: "Nature", museum: "Culture", place_of_worship: "Culture", art_gallery: "Culture", tourist_attraction: "Sights", lodging: "Lodging", hotel: "Lodging", train_station: "Transport", airport: "Transport" };
const prettyType = (t: string) => t.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/**
 * Propose an activity (CreateActivityRequest) by hand, or with `discover` from a place search; or edit one. With
 * `branchAt` it is a new place for a branch at that plan's time instead: no vote, straight onto the same slot.
 */
export default function IdeaForm({ edit, preset, discover, branchAt }: { edit?: ActivityResponse; preset?: Partial<Draft>; discover?: boolean; branchAt?: ActivityResponse }) {
  const store = useTrip(), { services } = useApp(), o = useOverlay(), t = store.trip;
  const [tab, setTab] = useState<"search" | "manual">(discover && services.placeSearch && !edit && !preset ? "search" : "manual");
  const [d, setD] = useState<Draft>({
    name: edit?.name ?? "", location: edit?.location ?? "", category: edit?.category ?? "Sights", description: edit?.description ?? "",
    date: edit?.date ?? "", startTime: hm(edit?.startTime), endTime: hm(edit?.endTime), tags: edit?.tags ?? [], imageUrls: edit?.imageUrls ?? [],
    latitude: edit?.latitude ?? null, longitude: edit?.longitude ?? null, ...preset,
  });
  const [q, setQ] = useState(""), [results, setResults] = useState<PlaceResult[] | null>(null), [why, setWhy] = useState<Record<string, string>>({}), [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(""), [err, setErr] = useState<Record<string, string>>({}), [tag, setTag] = useState("");
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const cats = CATEGORIES.includes(d.category) ? CATEGORIES : [...CATEGORIES, d.category];

  const search = async (e?: FormEvent) => {
    e?.preventDefault(); if (!q.trim()) return;
    setBusy("search"); setErr({});
    try { setResults(await searchPlaces(t.tripId, q.trim())); setPick(null); } catch (ex) { setErr({ search: apiErrorMessage(ex, "Search failed") }); setResults([]); } finally { setBusy(""); }
  };
  const explain = async (p: PlaceResult) => {
    setWhy({ ...why, [p.placeId]: "…" });
    try { const r = await getPlaceRecommendation(t.tripId, { name: p.name, address: p.address, primaryType: p.primaryType }); setWhy((w) => ({ ...w, [p.placeId]: r.reason })); }
    catch (ex) { setWhy((w) => ({ ...w, [p.placeId]: apiErrorMessage(ex, "No suggestion right now") })); }
  };
  /* "Use this place" proposes it straight away: name, address, category, pin and (when photos are on) its Google photo. */
  const addPlace = async (p: PlaceResult) => {
    setBusy("add");
    try {
      let imageUrls: string[] = [];
      if (services.placePhotos) {
        try { const blob = await fetchPlacePhoto(t.tripId, p.placeId); if (blob) imageUrls = [await uploadActivityImage(new File([blob], "place.jpg", { type: blob.type || "image/jpeg" }))]; }
        catch { /* a place without a photo is fine */ }
      }
      const a = await createActivity(t.tripId, { name: p.name, location: p.address, category: TYPE_CAT[p.primaryType ?? ""] ?? (p.primaryType ? family(p.primaryType) : "Sights"),
        description: null, tags: [], imageUrls, date: null, startTime: null, endTime: null, latitude: p.latitude, longitude: p.longitude });
      store.putActivities([a]); setPick(null);
      o.toast(a.status === "APPROVED" ? a.name + " approved" : "Proposed " + a.name);
    } catch (ex) { o.toast(apiErrorMessage(ex, "Could not add this place")); } finally { setBusy(""); }
  };
  const addPhoto = (file?: File) => {
    if (!file) return; if (file.size > 5 * 1024 * 1024) { setErr({ photo: "Images must be 5 MB or smaller" }); return; }
    setBusy("photo");
    uploadActivityImage(file).then((url) => setD((x) => ({ ...x, imageUrls: [...x.imageUrls, url].slice(0, 8) }))).catch((ex) => setErr({ photo: apiErrorMessage(ex, "Photo not uploaded") })).finally(() => setBusy(""));
  };
  const commitTag = () => {
    const g = tag.trim().replace(/^#/, "").toLowerCase().slice(0, 40);
    if (g && !d.tags.includes(g) && d.tags.length < 10) setD((x) => ({ ...x, tags: [...x.tags, g] }));
    setTag("");
  };
  const tagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !tag && d.tags.length) { setD({ ...d, tags: d.tags.slice(0, -1) }); return; }
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault(); commitTag();
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = d.name.trim(), location = d.location.trim(), st = d.startTime, en = d.endTime;
    const next: Record<string, string> = {};
    if (!name) next.name = "Activity name is required";
    else if (!location) next.location = "Location is required";
    else if ((st && !en) || (!st && en)) next.time = "Set both times";
    else if (st && en && en <= st) next.time = "End time must be after start";
    else if (st && !d.date) next.time = "Pick a day for this time";
    setErr(next); if (Object.keys(next).length) return;
    setBusy("save");
    const pending = tag.trim().replace(/^#/, "").toLowerCase().slice(0, 40);
    const tags = pending && !d.tags.includes(pending) && d.tags.length < 10 ? [...d.tags, pending] : d.tags;
    const body = { name, location, category: d.category, description: d.description.trim() || null, tags, imageUrls: d.imageUrls, date: d.date || null, startTime: st || null, endTime: en || null,
      ...(d.latitude != null && d.longitude != null ? { latitude: d.latitude, longitude: d.longitude } : {}) };
    try {
      if (branchAt) {
        await createBranchPlan(t.tripId, { ...body, date: branchAt.date, startTime: branchAt.startTime, endTime: branchAt.endTime });
        await store.refreshActivities(); o.closeDialog(); o.toast(name + " added at the same time as " + branchAt.name); return;
      }
      const a = edit ? await updateActivity(edit.id, body) : await createActivity(t.tripId, body);
      store.putActivities([a]); o.closeDialog(); o.toast(edit ? "Saved" : a.status === "APPROVED" ? a.name + " approved" : "Proposed " + a.name);
    } catch (ex) { setErr({ form: apiErrorMessage(ex, "Could not save") }); } finally { setBusy(""); }
  };

  /* Search results as a compact list; picking one opens its details (map, AI note, use it) in place of the list. */
  const catOf = (p: PlaceResult) => TYPE_CAT[p.primaryType ?? ""] ?? family(p.primaryType);
  const added = (p: PlaceResult) => store.activities.some((a) => a.name.toLowerCase() === p.name.toLowerCase());
  const open = (p: PlaceResult) => { setPick(p.placeId); if (services.aiRecommendations && !why[p.placeId]) explain(p); };
  const placeResults = () => {
    const sel = results?.find((p) => p.placeId === pick);
    if (sel) return <div className="place-detail">
      <button type="button" className="btn btn-ghost btn-sm place-back" onClick={() => setPick(null)}><Icon n="left" s={16} />Results</button>
      <PlaceMap placeId={sel.placeId} lat={sel.latitude} lng={sel.longitude} name={sel.name} height={260} />
      <div><b className="place-name">{sel.name}</b><div className="meta" style={{ marginTop: 4 }}><Icon n="pin" s={14} />{sel.address}</div>
        <div className="pills" style={{ marginTop: 10 }}><Chip text={sel.primaryType ? prettyType(sel.primaryType) : catOf(sel)} icon={catIcon(catOf(sel))} cls={"cat-" + catKey(catOf(sel))} /></div></div>
      {why[sel.placeId] && <div className="place-why">{why[sel.placeId] === "…" ? <><Spinner s={14} /><span className="shiny">Asking AI why it fits</span></> : <><Icon n="sparkle" s={14} />{why[sel.placeId]}</>}</div>}
      <div className="dlg-foot"><button type="button" className="btn btn-primary" disabled={busy === "add"} onClick={() => addPlace(sel)}>{busy === "add" ? <Spinner s={16} /> : <Icon n="plus" s={16} />}Use this place</button></div>
    </div>;
    return <div className="place-list" role="list">{results!.map((p) => { const cat = catOf(p), was = added(p); return <button key={p.placeId} type="button" role="listitem" className={"place-hit" + (was ? " was" : "")} disabled={was} onClick={() => open(p)}>
      <span className={"place-ico cat-" + catKey(cat)}><Icon n={catIcon(cat)} s={18} /></span>
      <span className="place-txt"><b>{p.name}</b><small>{p.address}</small></span>
      {was ? <Chip text="Added" cls="c-violet" /> : <Icon n="right" s={16} className="place-go" />}
    </button>; })}</div>;
  };

  return <div className="dlg-body">
    <DlgHead title={edit ? "Edit activity" : branchAt ? <><Icon n="branch" s={20} /> New branch</> : tab === "search" ? <><Icon n="globe" s={20} /> Discover</> : "Add activity"} onClose={o.closeDialog} />
    {tab === "search" ? (!services.placeSearch ? <Empty icon="ban" text="Place search is off"><button type="button" className="btn btn-outline btn-sm" onClick={() => setTab("manual")}>Add manually</button></Empty> : <>
      <form className="search" style={{ background: "var(--field)" }} onSubmit={search}><Icon n="search" s={18} /><span className="sr">Search places</span>
        <input type="search" placeholder={"Search near " + t.destination.split(",")[0]} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <button className="btn btn-solid btn-sm" disabled={busy === "search"}>{busy === "search" ? <Spinner s={15} /> : "Search"}</button></form>
      <FieldErr msg={err.search} />
      {results && (results.length ? placeResults() : <Empty icon="search" text="No places found"><button type="button" className="btn btn-outline btn-sm" onClick={() => setTab("manual")}>Add manually</button></Empty>)}
    </>) : <form className="form-grid" onSubmit={submit} noValidate>
      <div className="field">Photos <small className="num">{d.imageUrls.length}/8</small><div className="photo-row">
        {d.imageUrls.map((p, i) => <span key={p} className="photo-cell"><Thumb src={p} tone="tone-sky" size={[176, 132]} />
          <button type="button" className="icon-btn sm" aria-label="Remove photo" onClick={() => setD({ ...d, imageUrls: d.imageUrls.filter((_, k) => k !== i) })}><Icon n="x" s={13} /></button></span>)}
        {d.imageUrls.length < 8 && <label className="photo-add" aria-label="Add photo">{busy === "photo" ? <Spinner /> : <Icon n="upload" s={18} />}
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ""; }} /></label>}
      </div><FieldErr msg={err.photo} /></div>
      <label className="field">Name<input className="input" maxLength={160} value={d.name} onChange={set("name")} placeholder="Fushimi Inari Shrine" autoFocus /></label>
      <FieldErr msg={err.name} />
      <div className="field">Category<div className="pills cat-pills" role="radiogroup" aria-label="Category">{cats.map((c) => <label key={c}>
        <input type="radio" name="ideaCat" checked={d.category === c} onChange={() => setD({ ...d, category: c })} /><span><Icon n={catIcon(c)} s={15} />{c}</span></label>)}</div></div>
      <label className="field">Location<span className="input-ico"><Icon n="pin" s={17} /><input className="input" maxLength={200} value={d.location} onChange={set("location")} placeholder="Address or area" /></span></label>
      <FieldErr msg={err.location} />
      {branchAt ? <p className="hint"><Icon n="clock" s={14} /> {fwd(branchAt.date!)} {fd(branchAt.date!)} · {hm(branchAt.startTime)}–{hm(branchAt.endTime)}, same time as {branchAt.name}</p> : <div className="row3"><label className="field">Day<select className="input" value={d.date} onChange={set("date")}><option value="">Any day</option>{daysBetween(t.startDate, t.endDate).map((x) => <option key={x} value={x}>{fwd(x)} {fd(x)}</option>)}</select></label>
        <label className="field">From<input className="input num" type="time" value={d.startTime} onChange={set("startTime")} /></label>
        <label className="field">To<input className="input num" type="time" value={d.endTime} onChange={set("endTime")} /></label></div>}
      <FieldErr msg={err.time} />
      <label className="field">Tags <small className="num">{d.tags.length}/10</small><span className="tag-box">
        {d.tags.map((g, i) => <span key={g} className="tag">#{g}<button type="button" aria-label={"Remove " + g} onClick={(e) => { e.preventDefault(); setD({ ...d, tags: d.tags.filter((_, k) => k !== i) }); }}><Icon n="x" s={12} /></button></span>)}
        {d.tags.length < 10 && <input maxLength={40} placeholder={d.tags.length ? "" : "Type, then Enter"} aria-label="Add tag" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={tagKey} onBlur={() => commitTag()} />}
      </span></label>
      <label className="field">Notes<textarea className="input" maxLength={2000} rows={3} value={d.description} onChange={set("description")} /></label>
      <FieldErr msg={err.form} />
      <div className="dlg-foot"><button type="button" className="btn btn-ghost" onClick={o.closeDialog}>Cancel</button><button className="btn btn-primary" disabled={busy === "save" || busy === "photo"}>{edit ? "Save" : branchAt ? "Add branch" : "Propose"}</button></div>
    </form>}
  </div>;
}

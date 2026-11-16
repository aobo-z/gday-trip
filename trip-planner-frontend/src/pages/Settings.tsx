import { useEffect, useState, type FormEvent } from "react";
import { changeEmail, changePassword, updateProfile } from "../api/userApi";
import { deleteAdminTrip, fetchAdminTrips, fetchAdminUsers, setUserDisabled, type AdminPage, type AdminTrip, type AdminUser } from "../api/adminApi";
import { fetchAiModels, fetchServiceSettings, testService, updateServiceSettings, type AiModelOption, type MapProvider, type ServiceSettings, type TestableService } from "../api/serviceApi";
import { apiErrorMessage } from "../api/apiError";
import { useApp, useMe, useSession } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";
import { Avatar, Chip, Empty, FieldErr, FxCanvas, Icon, Seg, Spinner } from "../ui/kit";
import { THEMES, THEME_KEYS } from "../lib/theme";
import { STATUS } from "../lib/domain";
import { MON, fdy, frange, pd } from "../lib/format";
import { usePeek } from "../parts/usePeek";

function pwScore(p: string) { let s = 0; if (p.length >= 8) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^\w]/.test(p) || p.length >= 14) s++; return s; }

/** One account setting: what it is now, and the form to change it, opened in place. */
function SetItem({ icon, label, value, open, onToggle, children }: { icon: string; label: string; value: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <div className={"set-item" + (open ? " open" : "")}>
    <div className="set-item-head"><span className="fact-ico"><Icon n={icon} s={17} /></span>
      <span className="fact-txt"><small>{label}</small><b>{value}</b></span>
      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={onToggle}>{open ? "Cancel" : "Edit"}</button></div>
    {open && <div className="set-item-body">{children}</div>}
  </div>;
}

function Account() {
  const me = useMe(), { setUser } = useSession(), o = useOverlay();
  const [open, setOpen] = useState<"name" | "email" | "pw" | null>(null);
  const [name, setName] = useState(me.username), [email, setEmail] = useState(""), [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [err, setErr] = useState<Record<string, string>>({});
  const toggle = (k: "name" | "email" | "pw") => { setErr({}); setOpen(open === k ? null : k); };
  const saveName = async (e: FormEvent) => {
    e.preventDefault(); const v = name.trim();
    if (!v) return setErr({ name: "Username is required" });
    try { setUser(await updateProfile(v)); setErr({}); setOpen(null); o.toast("Username saved"); } catch (ex) { setErr({ name: apiErrorMessage(ex, "Username not saved") }); }
  };
  const saveEmail = async (e: FormEvent) => {
    e.preventDefault(); const v = email.trim().toLowerCase();
    const msg = !v ? "New email is required" : !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v) ? "Email must be valid" : v === me.email ? "That is already your email" : "";
    if (msg) return setErr({ email: msg });
    try { const a = await changeEmail(v); if (a.token) localStorage.setItem("token", a.token); setUser({ ...me, email: a.email }); setEmail(""); setErr({}); setOpen(null); o.toast("Email changed"); }
    catch (ex) { setErr({ email: apiErrorMessage(ex, "Email not changed") }); }
  };
  const savePw = async (e: FormEvent) => {
    e.preventDefault(); const bad = pw.next.length < 8 || pw.next.length > 72;
    const msg = !pw.current ? "Current password is required" : !pw.next ? "New password is required" : bad ? "Password must be between 8 and 72 characters" : pw.next !== pw.confirm ? "Passwords don't match" : "";
    if (msg) return setErr({ pw: msg });
    try { await changePassword(pw.current, pw.next); setPw({ current: "", next: "", confirm: "" }); setErr({}); setOpen(null); o.toast("Password updated"); }
    catch (ex) { setErr({ pw: apiErrorMessage(ex, "Password not changed") }); }
  };
  const score = pwScore(pw.next), col = ["var(--bad)", "var(--bad)", "var(--warn)", "var(--good)", "var(--good)"][score];
  const joined = me.createdAt ? pd(me.createdAt.slice(0, 10)) : null;
  return <>
    <section className="card set-hero"><Avatar id={me.userId} name={me.username} size={60} />
      <div className="set-hero-txt"><h2>{me.username}</h2><span className="hint">{me.email}</span></div>
      {joined && <Chip text={`Joined ${MON[joined.getMonth()]} ${joined.getFullYear()}`} icon="cal" />}</section>
    <section className="card set-card"><h3>Account</h3>
      <SetItem icon="user" label="Username" value={me.username} open={open === "name"} onToggle={() => toggle("name")}>
        <form className="set-form" onSubmit={saveName} noValidate><input className="input" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} aria-label="Username" autoFocus />
          <button className="btn btn-primary">Save</button></form><FieldErr msg={err.name} /></SetItem>
      <SetItem icon="mail" label="Email" value={me.email} open={open === "email"} onToggle={() => toggle("email")}>
        <form className="set-form" onSubmit={saveEmail} noValidate><input className="input" type="email" maxLength={100} autoComplete="off" placeholder="New email" aria-label="New email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <button className="btn btn-primary">Change</button></form><FieldErr msg={err.email} /></SetItem>
      <SetItem icon="lock" label="Password" value="••••••••" open={open === "pw"} onToggle={() => toggle("pw")}>
        <form className="set-pw" onSubmit={savePw} noValidate>
          <label className="field">Current<input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoFocus /></label>
          <div className="row2"><label className="field">New<input className="input" type="password" maxLength={72} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
            <label className="field">Confirm<input className="input" type="password" maxLength={72} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label></div>
          <div className="pw-meter" aria-hidden="true">{[0, 1, 2, 3].map((k) => <i key={k} style={{ background: k < score ? col : undefined }} />)}</div>
          <FieldErr msg={err.pw} /><div className="dlg-foot"><button className="btn btn-primary">Update password</button></div></form></SetItem>
    </section>
  </>;
}

function Themes() {
  const me = useMe(), { setTheme } = useSession(), o = useOverlay();
  return <section className="card set-card"><h3>Appearance</h3><div className="theme-grid set-themes">{THEME_KEYS.map((k) => { const th = THEMES[k], on = (me.accentColor ?? "AURORA") === k;
    return <button key={k} type="button" className="theme-tile" aria-pressed={on} onClick={(e) => setTheme(k, e.clientX, e.clientY).catch(() => o.toast("Theme not saved"))}><FxCanvas k={k} />
      <span className="theme-name"><b>{th.label}</b><span className="dots">{th.brand.map((c) => <i key={c} style={{ background: c }} />)}</span><Icon n={th.dark ? "moon" : "sun"} s={15} />{on && <span className="tick"><Icon n="check" s={14} /></span>}</span></button>; })}</div></section>;
}

const SVC: [keyof ServiceSettings, TestableService, string, string][] = [["placeSearch", "place-search", "Place search", "search"], ["placePhotos", "place-photos", "Place photos", "image"], ["aiRecommendations", "ai", "AI", "sparkle"]];
function useAdminList<T>(load: (q: string, p: number) => Promise<AdminPage<T>>) {
  const [q, setQ] = useState(""), [page, setPage] = useState(0), [data, setData] = useState<AdminPage<T> | null>(null), [rev, setRev] = useState(0);
  useEffect(() => { const id = window.setTimeout(() => load(q, page).then(setData).catch(() => setData({ items: [], page: 0, totalPages: 0, totalItems: 0 })), 200); return () => clearTimeout(id); }, [q, page, rev, load]);
  return { q, setQ: (v: string) => { setQ(v); setPage(0); }, page, setPage, data, reload: () => setRev((n) => n + 1) };
}
function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  if (total < 2) return null;
  return <div className="sec-head" style={{ justifyContent: "flex-end", marginTop: 8 }}><span className="hint num">{page + 1} / {total}</span>
    <button type="button" className="icon-btn sm" disabled={page <= 0} aria-label="Previous page" onClick={() => onPage(page - 1)}><Icon n="left" /></button>
    <button type="button" className="icon-btn sm" disabled={page >= total - 1} aria-label="Next page" onClick={() => onPage(page + 1)}><Icon n="right" /></button></div>;
}
function Admin() {
  const o = useOverlay(), me = useMe(), app = useApp(), peek = usePeek();
  const [svc, setSvc] = useState<ServiceSettings | null>(null), [models, setModels] = useState<AiModelOption[]>([]), [tests, setTests] = useState<Record<string, string>>({});
  useEffect(() => { fetchServiceSettings().then(setSvc).catch(() => undefined); fetchAiModels().then(setModels).catch(() => undefined); }, []);
  const users = useAdminList<AdminUser>(fetchAdminUsers), trips = useAdminList<AdminTrip>(fetchAdminTrips);
  const save = async (patch: Partial<ServiceSettings>) => {
    if (!svc) return; const next = { ...svc, ...patch };
    setSvc(next);
    try { setSvc(await updateServiceSettings({ placeSearch: next.placeSearch, placePhotos: next.placePhotos, aiRecommendations: next.aiRecommendations, mapProvider: next.mapProvider, aiModel: next.aiModel })); app.refreshServices(); o.toast("Saved"); }
    catch (e) { setSvc(svc); o.toast(apiErrorMessage(e, "Not saved")); }
  };
  const test = async (k: TestableService) => { setTests({ ...tests, [k]: "…" }); try { const r = await testService(k, k === "ai" ? svc?.aiModel : undefined); setTests((t) => ({ ...t, [k]: r.ok ? r.latencyMs + " ms" : r.message || "Failed" })); } catch (e) { setTests((t) => ({ ...t, [k]: apiErrorMessage(e, "Failed") })); } };
  const disable = async (u: AdminUser) => {
    if (!u.disabled && !(await o.confirm({ title: `Disable ${u.username}?`, body: "They can't sign in until re-enabled.", label: "Disable", danger: true }))) return;
    try { await setUserDisabled(u.userId, !u.disabled); users.reload(); o.toast(u.username + (u.disabled ? " enabled" : " disabled")); } catch (e) { o.toast(apiErrorMessage(e, "Not changed")); }
  };
  const delTrip = async (t: AdminTrip) => {
    if (!(await o.confirm({ title: `Delete ${t.name}?`, body: `Removed for ${t.members.length === 1 ? "its only member" : `all ${t.members.length} members`}.`, label: "Delete trip", danger: true }))) return;
    try { await deleteAdminTrip(t.tripId); trips.reload(); app.refreshTrips(); o.toast("Trip deleted"); } catch (e) { o.toast(apiErrorMessage(e, "Not deleted")); }
  };
  return <>
    <div className="svc-grid">
      {!svc ? <section className="card pad"><div className="empty"><Spinner /></div></section> : SVC.map(([key, id, label, icon]) => { const r = tests[id]; return <section key={id} className={"card pad svc-tile" + (svc[key] ? " on" : "")}>
        <div className="svc-top"><span className="svc-ico"><Icon n={icon} s={20} /></span>
          <label className="toggle"><input type="checkbox" checked={!!svc[key]} aria-label={label} onChange={(e) => save({ [key]: e.target.checked })} /><span /></label></div>
        <b>{label}</b>
        <div className="svc-foot">{r === "…" ? <Spinner s={15} /> : r ? <Chip text={r} cls={/ms$/.test(r) ? "c-good" : "c-warn"} /> : <span className="hint">{svc[key] ? "On" : "Off"}</span>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => test(id)}><Icon n="zap" s={14} />Test</button></div>
      </section>; })}
      {svc && <section className="card pad svc-tile">
        <div className="field">AI model<select className="input" aria-label="AI model" value={svc.aiModel} onChange={(e) => save({ aiModel: e.target.value })}>
          {models.map((m) => <option key={m.id} value={m.id}>{m.displayName}{m.id === svc.defaultAiModel ? " · default" : ""}</option>)}</select></div>
        <div className="field">Map<div><Seg name="mapProvider" value={svc.mapProvider} onChange={(v: MapProvider) => save({ mapProvider: v })} options={[["GOOGLE", "Google"], ["OSM", "OSM"], ["OFF", "Off"]]} /></div></div>
      </section>}
    </div>
    <section className="card pad"><div className="sec-head"><h3>Users<span className="n num">{users.data?.totalItems ?? "…"}</span></h3>
      <label className="search" style={{ background: "var(--field)", flex: "0 1 240px", height: 38 }}><Icon n="search" s={16} /><input type="search" placeholder="Search" value={users.q} onChange={(e) => users.setQ(e.target.value)} aria-label="Search users" /></label></div>
      <div className="table-box" style={{ marginTop: 6 }}><table><thead><tr><th>User</th><th>Role</th><th>Joined</th><th style={{ textAlign: "right" }}>Active</th></tr></thead><tbody>{users.data?.items.map((u) => <tr key={u.userId}>
        <td><span className="place"><Avatar id={u.userId} name={u.username} onClick={() => peek.person(u.userId, u.username)} /><span><b>{u.username}</b><small className="hint" style={{ display: "block" }}>{u.email}</small></span></span></td>
        <td>{u.role === "ADMIN" ? <Chip text="Admin" cls="c-violet" icon="shield" /> : <span className="hint">User</span>}</td>
        <td className="hint num" style={{ whiteSpace: "nowrap" }}>{fdy(u.createdAt)}</td>
        <td style={{ textAlign: "right" }}><label className="toggle"><input type="checkbox" checked={!u.disabled} disabled={u.userId === me.userId} aria-label={u.username + " enabled"} onChange={() => disable(u)} /><span /></label></td></tr>)}</tbody></table></div>
      <Pager page={users.page} total={users.data?.totalPages ?? 0} onPage={users.setPage} /></section>
    <section className="card pad"><div className="sec-head"><h3>Trips<span className="n num">{trips.data?.totalItems ?? "…"}</span></h3>
      <label className="search" style={{ background: "var(--field)", flex: "0 1 240px", height: 38 }}><Icon n="search" s={16} /><input type="search" placeholder="Search" value={trips.q} onChange={(e) => trips.setQ(e.target.value)} aria-label="Search trips" /></label></div>
      {trips.data && !trips.data.items.length ? <Empty icon="grid" text="No trips" /> : <div className="table-box" style={{ marginTop: 6 }}><table><thead><tr><th>Trip</th><th>Owner</th><th>Members</th><th>Status</th><th>Dates</th><th /></tr></thead><tbody>
        {trips.data?.items.map((t) => <tr key={t.tripId}><td><b>{t.name}</b><small className="hint" style={{ display: "block" }}>{t.destination}</small></td><td>{t.owner ?? "—"}</td><td className="num">{t.members.length}</td>
          <td><Chip text={STATUS[t.status]?.[0] ?? t.status} cls={STATUS[t.status]?.[1]} /></td><td className="hint num" style={{ whiteSpace: "nowrap" }}>{frange(t.startDate, t.endDate)}</td>
          <td><button type="button" className="icon-btn sm" aria-label={"Delete " + t.name} onClick={() => delTrip(t)}><Icon n="trash" s={16} /></button></td></tr>)}</tbody></table></div>}
      <Pager page={trips.page} total={trips.data?.totalPages ?? 0} onPage={trips.setPage} /></section>
  </>;
}

export default function Settings() {
  const me = useMe(), admin = me.role === "ADMIN";
  const [tab, setTab] = useState<"account" | "admin">("account");
  return <>
    <div className="sec-head"><h1>Settings</h1>{admin && <Seg name="setTab" value={tab} onChange={setTab} options={[["account", "Account"], ["admin", <><Icon n="shield" s={15} /> Admin</>]]} />}</div>
    {tab === "account" ? <div className="set-page"><Account /><Themes /></div> : admin ? <Admin /> : null}
  </>;
}

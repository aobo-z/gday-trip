import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { apiErrorMessage } from "../api/apiError";
import { useSession } from "../lib/stores";
import { THEMES, THEME_KEYS, savedTheme, switchTheme, type AccentColor } from "../lib/theme";
import { Avatar, Chip, FieldErr, FxCanvas, Icon, Seg } from "../ui/kit";
import { ICONS } from "../ui/icons";

function Feat({ icon, label, tilt, i, children }: { icon: string; label: string; tilt: number; i: number; children: ReactNode }) {
  return <div className="feat" style={{ "--tilt": tilt + "deg", "--i": i } as React.CSSProperties}>{children}<div className="feat-label"><Icon n={icon} s={14} />{label}</div></div>;
}
const P = (id: number, name: string) => ({ id, name });

/** Small drawings of what the app does, on both sides of the sign-in card. */
function Showcase({ side }: { side: "left" | "right" }) {
  if (side === "left") return <>
    <Feat icon="vote" label="Vote" tilt={-3} i={0}>
      <div className="fv-row"><span className="fv-ico cat-culture"><Icon n="landmark" s={15} /></span><b>Fushimi Inari</b></div>
      <div className="fv-bar"><i className="on" /><i className="on" /><i className="on" /><i /></div>
      <div className="fv-foot"><span className="stack">{[P(2, "Tom"), P(3, "Ravi"), P(4, "Lena")].map((p) => <Avatar key={p.id} {...p} />)}</span><Chip text="3/4" cls="c-good" icon="check" /></div>
    </Feat>
    <Feat icon="cal" label="Schedule" tilt={2} i={1}>
      <div className="fs-row"><span className="num">09:00</span><i className="cat-culture">Kiyomizu</i></div>
      <div className="fs-row"><span className="num">12:00</span><i className="cat-food">Nishiki</i><i className="fs-alt"><Icon n="branch" s={11} />Tea</i></div>
      <div className="fs-row"><span className="num">18:00</span><i className="cat-sights">Gion</i></div>
    </Feat>
    <Feat icon="map" label="Map" tilt={-1.5} i={2}>
      <div className="fm"><svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"><path d="M100 18 C80 26 72 44 64 62 L100 62Z" fill="var(--map-water)" /><ellipse cx="22" cy="44" rx="14" ry="9" fill="var(--map-park)" />
        <path d="M14 14 L44 30 L80 18" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" /></svg>
        <span className="fm-pin" style={{ left: "14%", top: "23%" }}>1</span><span className="fm-pin" style={{ left: "44%", top: "50%" }}>2</span><span className="fm-pin" style={{ left: "80%", top: "30%" }}>3</span></div>
    </Feat>
  </>;
  return <>
    <Feat icon="sparkle" label="AI planner" tilt={2.5} i={0}>
      <div className="fa-head"><span className="ai-orb fa-orb"><Icon n="sparkle" s={15} /></span><b>5 days in Kyoto</b></div>
      {([["Temples", 70], ["Markets", 52], ["Arashiyama", 62]] as const).map(([d, w], i) => <div key={d} className="fa-day"><span className="num">D{i + 1}</span><i style={{ width: w + "%" }} /><small>{d}</small></div>)}
    </Feat>
    <Feat icon="wallet" label="Split" tilt={-2} i={1}>
      <div className="fx-pay"><Avatar id={2} name="Tom" /><span className="fx-arrow"><Icon n="arrow" s={14} /></span><Avatar id={1} name="Mia" /><b className="num">A$42.50</b></div>
      <div className="fx-bar"><i style={{ flex: 5, background: "#3F74AD" }} /><i style={{ flex: 3, background: "#C8673F" }} /><i style={{ flex: 2, background: "#0F907C" }} /><i style={{ flex: 1, background: "#8A5AA6" }} /></div>
    </Feat>
    <Feat icon="globe" label="Community" tilt={1.5} i={2}>
      <div className="fc tone-rose" style={{ backgroundImage: "url('/covers/seoul.svg')", backgroundSize: "cover" }}><span>Seoul</span>
        <b className="fc-like"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS.heart }} /><span className="num">48</span></b></div>
    </Feat>
  </>;
}

export default function Auth({ mode }: { mode: "signin" | "register" }) {
  const nav = useNavigate(), { signIn, register } = useSession();
  const [theme, setTheme] = useState<AccentColor>(savedTheme), [picked, setPicked] = useState(false);
  const [v, setV] = useState({ username: "", email: "", password: "", confirm: "" });
  const [errOn, setErrOn] = useState({ mode, msg: "" }), [busy, setBusy] = useState(false);
  const reg = mode === "register";
  /* An error belongs to the tab it was raised on, so switching Sign in / Register clears it. */
  const err = errOn.mode === mode ? errOn.msg : "", setErr = (msg: string) => setErrOn({ mode, msg });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const em = v.email.trim(), pw = v.password;
    const msg = reg && !v.username.trim() ? "Username is required" : !em ? "Email is required" : !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(em) ? "Email must be valid" : !pw ? "Password is required"
      : reg && (pw.length < 8 || pw.length > 72) ? "Password must be between 8 and 72 characters" : reg && pw !== v.confirm ? "Passwords don't match" : "";
    setErr(msg); if (msg) return;
    setBusy(true);
    /* Only a theme chosen here is carried in; otherwise the account keeps the theme it already has. */
    const chosen = picked ? theme : undefined;
    try { if (reg) await register(v.username.trim(), em, pw, chosen); else await signIn(em, pw, chosen); }
    catch (ex) { setErr(apiErrorMessage(ex, reg ? "Could not create the account" : "Email or password is incorrect")); }
    finally { setBusy(false); }
  };
  return <div id="auth">
    <FxCanvas />
    <div className="auth-wrap enter">
      <div className="auth-side left" aria-hidden="true"><Showcase side="left" /></div>
      <div className="auth-center">
        <h1 className="slogan">Plan trips <span>together.</span></h1>
        <div className="auth-chips" aria-hidden="true">{[["vote", "Vote"], ["cal", "Schedule"], ["map", "Map"], ["sparkle", "AI"], ["wallet", "Split"], ["globe", "Community"]].map(([i, l]) => <span key={l}><Icon n={i} s={14} />{l}</span>)}</div>
        <div className="auth-card">
          <div className="brand" style={{ padding: 0 }}>G’Day Trip</div>
          <Seg name="authTab" value={mode} options={[["signin", "Sign in"], ["register", "Register"]]} onChange={(m) => nav(m === "register" ? "/register" : "/login", { replace: true, state: history.state?.usr })} />
          <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {reg && <label className="field">Username<input className="input" maxLength={50} autoComplete="username" value={v.username} onChange={set("username")} /></label>}
            <label className="field">Email<input className="input" type="email" maxLength={100} autoComplete="email" placeholder="you@example.com" value={v.email} onChange={set("email")} /></label>
            <label className="field">Password<input className="input" type="password" maxLength={72} autoComplete={reg ? "new-password" : "current-password"} value={v.password} onChange={set("password")} /></label>
            {reg && <label className="field">Confirm<input className="input" type="password" maxLength={72} autoComplete="new-password" value={v.confirm} onChange={set("confirm")} /></label>}
            <FieldErr msg={err} />
            <span className="star star-block"><button className="btn btn-primary btn-block" disabled={busy}>{reg ? "Create account" : "Continue"}</button></span>
          </form>
          <div className="swatches" style={{ justifyContent: "center" }}>
            {THEME_KEYS.map((k) => { const b = THEMES[k].brand; return <button key={k} type="button" aria-pressed={theme === k} aria-label={THEMES[k].label + " theme"} title={THEMES[k].label}
              style={{ background: `conic-gradient(from 200deg,${b[0]},${b[1]},${b[2]},${b[0]})` }} onClick={(e) => { setTheme(k); setPicked(true); switchTheme(k, e.clientX, e.clientY); }} />; })}
          </div>
        </div>
      </div>
      <div className="auth-side right" aria-hidden="true"><Showcase side="right" /></div>
    </div>
  </div>;
}

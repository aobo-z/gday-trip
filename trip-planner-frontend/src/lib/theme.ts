/* Themes, the WebGL backgrounds and small motion helpers.
   One shader draws four looks after React Bits SoftAurora / LineWaves / Grainient / Galaxy. */

export type AccentColor = "AURORA" | "OCEAN" | "SUNSET" | "MIDNIGHT";
export interface Theme { label: string; fx: number; dark: boolean; primary: string; soft: string; text: string; ink: string; bg: string; brand: [string, string, string] }
export const THEMES: Record<AccentColor, Theme> = {
  AURORA: { label: "Aurora", fx: 0, dark: false, primary: "#2F6BEA", soft: "#E8EEFE", text: "#2445A8", ink: "#FFFFFF", bg: "#F4F5F7", brand: ["#2F6BEA", "#26C29B", "#8DB8FF"] },
  OCEAN: { label: "Ocean", fx: 1, dark: false, primary: "#0B7C8C", soft: "#DCF0F2", text: "#095C68", ink: "#FFFFFF", bg: "#F0F5F6", brand: ["#0B7C8C", "#3AA9E0", "#7FD6C6"] },
  SUNSET: { label: "Sunset", fx: 2, dark: false, primary: "#D9532A", soft: "#FCE8DC", text: "#9C3F14", ink: "#FFFFFF", bg: "#F8F4F0", brand: ["#E0592A", "#F2A541", "#E2688A"] },
  MIDNIGHT: { label: "Midnight", fx: 3, dark: true, primary: "#7C9CFF", soft: "#1E2846", text: "#B8C8FF", ink: "#0E1013", bg: "#0E1013", brand: ["#7C9CFF", "#F2C46D", "#4FD1C5"] },
};
export const THEME_KEYS = Object.keys(THEMES) as AccentColor[];
export const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
export const SPRING = typeof CSS !== "undefined" && CSS.supports("animation-timing-function", "linear(0, 1)")
  ? "linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 15.5%, 0.938 21.1%, 1.017 25.9%, 1.035 29.9%, 1.03 34.4%, 1.007 44.4%, 0.998 52.6%, 1.001 74.3%, 1)"
  : EASE;
const reduce = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
export const still = () => !!reduce?.matches;

export function savedTheme(): AccentColor {
  try { const k = localStorage.getItem("gday-theme") as AccentColor | null; if (k && THEMES[k]) return k; } catch { /* storage off */ }
  return "AURORA";
}
export function applyTheme(k: AccentColor | null | undefined) {
  const key = k && THEMES[k] ? k : "AURORA", th = THEMES[key], root = document.documentElement;
  let el = document.getElementById("themeCss");
  if (!el) { el = document.createElement("style"); el.id = "themeCss"; document.head.appendChild(el); }
  root.setAttribute("data-theme", th.dark ? "dark" : "light");
  root.dataset.palette = key;
  el.textContent = `html:root[data-theme]{--primary:${th.primary};--primary-soft:${th.soft};--primary-text:${th.text};--primary-ink:${th.ink};--bg:${th.bg};--brand-1:${th.brand[0]};--brand-2:${th.brand[1]};--brand-3:${th.brand[2]}}`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", th.bg);
  try { localStorage.setItem("gday-theme", key); } catch { /* storage off */ }
  FX.refresh();
}
/** Circular reveal from the tap point (a rare action, so it may take a little longer). */
export function switchTheme(k: AccentColor, x: number, y: number) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
  if (!doc.startViewTransition || still()) { applyTheme(k); return; }
  const root = document.documentElement;
  root.classList.add("vt-theme"); FX.pause();
  const tr = doc.startViewTransition(() => applyTheme(k));
  tr.ready.then(() => {
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 500, easing: "cubic-bezier(0.45, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" });
  }).catch(() => undefined);
  const end = () => requestAnimationFrame(() => { root.classList.remove("vt-theme"); FX.resume(); });
  tr.finished.then(end, end);
}

/* ---------- ClickSpark (React Bits) ---------- */
export function spark(x: number, y: number) {
  if (still()) return;
  const cs = getComputedStyle(document.documentElement), cols = ["--brand-1", "--brand-2", "--brand-3"].map((v) => cs.getPropertyValue(v).trim() || "#2F6BEA");
  const c = document.createElement("canvas"), S = 96, dpr = Math.min(2, devicePixelRatio || 1);
  c.width = c.height = S * dpr;
  c.style.cssText = `position:fixed;left:${x - S / 2}px;top:${y - S / 2}px;width:${S}px;height:${S}px;pointer-events:none;z-index:80`;
  document.body.appendChild(c);
  const g = c.getContext("2d")!, t0 = performance.now(), n = 9;
  g.scale(dpr, dpr); g.lineCap = "round"; g.lineWidth = 2;
  const draw = (now: number) => {
    const p = Math.min(1, (now - t0) / 420), e = 1 - Math.pow(1 - p, 3);
    g.clearRect(0, 0, S, S);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + 0.3, r1 = 10 + e * 26, len = 9 * (1 - e);
      g.strokeStyle = cols[i % 3];
      g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1); g.lineTo(S / 2 + Math.cos(a) * (r1 + len), S / 2 + Math.sin(a) * (r1 + len)); g.stroke();
    }
    if (p < 1) requestAnimationFrame(draw); else c.remove();
  };
  requestAnimationFrame(draw);
}

/* ---------- Spotlight (React Bits SpotlightCard): cards with .spot follow the pointer ---------- */
if (typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
  document.addEventListener("pointermove", (e) => {
    const el = (e.target as Element | null)?.closest?.(".spot") as HTMLElement | null; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", e.clientX - r.left + "px"); el.style.setProperty("--my", e.clientY - r.top + "px");
  }, { passive: true });
}

/* ---------- FX backgrounds ---------- */
const VERT = "#version 300 es\nconst vec2 c[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));void main(){gl_Position=vec4(c[gl_VertexID],0.,1.);}";
const FRAG = [
  "#version 300 es", "precision highp float;",
  "uniform vec2 uRes;uniform float uTime;uniform int uMode;uniform vec3 uC1,uC2,uC3,uBg;", "out vec4 o;",
  "float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
  "float n2(vec2 p){vec2 i=floor(p),f=fract(p);vec2 w=f*f*f*(f*(f*6.-15.)+10.);return mix(mix(h21(i),h21(i+vec2(1,0)),w.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),w.x),w.y);}",
  "float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n2(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}",
  "vec3 pal(float x){x=fract(x)*3.;return x<1.?mix(uC1,uC2,smoothstep(0.,1.,x)):x<2.?mix(uC2,uC3,smoothstep(1.,2.,x)):mix(uC3,uC1,smoothstep(2.,3.,x));}",
  "void main(){",
  " vec2 uv=gl_FragCoord.xy/uRes;float asp=uRes.x/uRes.y;vec2 p=vec2(uv.x*asp,uv.y);float t=uTime;vec3 col=uBg;",
  " if(uMode==0){",
  "  float a1=fbm(vec2(p.x*1.3+t*.05,t*.06));float a2=fbm(vec2(p.x*1.1-t*.04+3.,t*.05+5.));",
  "  float b1=exp(-pow((uv.y-(.64+(a1-.5)*.55))*5.,2.));float b2=exp(-pow((uv.y-(.40+(a2-.5)*.6))*6.,2.));",
  "  float rays=.6+.4*n2(vec2(p.x*8.+t*.25,uv.y*1.2));",
  "  vec3 k1=mix(uC1,uC2,smoothstep(0.,1.,uv.x+.25*sin(t*.12)));vec3 k2=mix(uC3,uC2,uv.x);",
  "  col=mix(col,k1,clamp(b1*rays*.9,0.,1.));col=mix(col,k2,clamp(b2*rays*.65,0.,1.));",
  " } else if(uMode==1){",
  "  vec2 q=p*1.6;float w=.16*sin(q.x*1.2+t*.35+.6*sin(q.y*1.6-t*.25))+.07*sin(q.x*2.6-t*.3+q.y);",
  "  float y=uv.y+w;float phi=y*18.;float fw=max(fwidth(phi),1e-4);",
  "  float d=abs(fract(phi+.5)-.5)/fw;float line=1.-smoothstep(.5,1.5,d);",
  "  float river=exp(-pow((y-.5-.16*sin(p.x*1.5-t*.3))/.2,2.));",
  "  vec3 lc=pal(y*.5+p.x*.12+t*.03);",
  "  col=mix(col,lc,line*(.22+.78*river));col=mix(col,lc,river*.1);",
  " } else if(uMode==2){",
  "  vec2 q=p+.4*vec2(fbm(p*1.2+t*.06),fbm(p*1.2-t*.05+4.));",
  "  float f=fbm(q*1.1+vec2(t*.03,-t*.02));",
  "  col=pal(q.x*.4+uv.y*.35+f*.7+t*.015);col=mix(col,uBg,.1);",
  "  col+=(h21(gl_FragCoord.xy+fract(t*.7)*91.)-.5)*.07;",
  " } else {",
  "  col=mix(uBg,mix(uC1,uC3,fbm(p*1.4+t*.02)),.28*fbm(p*2.2-t*.03));",
  "  for(int k=0;k<3;k++){float fk=float(k);float sc=34.+fk*30.;vec2 g=p*sc+vec2(t*(.5+fk*.35),0.);vec2 id=floor(g);vec2 f=fract(g)-.5;",
  "   float r=h21(id+fk*13.1);if(r>.9){vec2 off=vec2(h21(id+1.7),h21(id+3.1))-.5;float dd=length(f-off*.6);",
  "    float tw=.5+.5*sin(t*(1.2+r*3.)+r*40.);col+=mix(uC2,vec3(1.),.45)*smoothstep(.1,0.,dd)*tw*(1.-fk*.25);}}",
  " }", " o=vec4(col,1.);", "}",
].join("\n");

interface Fx { el: HTMLCanvasElement; gl: WebGL2RenderingContext; u: Record<string, WebGLUniformLocation | null>; key: string; card: boolean; visible: boolean; mode: number; cols: number[][]; bg: number[] }
export const FX = (() => {
  let list: Fx[] = [], raf = 0, paused = false;
  const programs = new WeakMap<HTMLCanvasElement, { gl: WebGL2RenderingContext; u: Fx["u"] }>();
  const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((es) => es.forEach((e) => { const f = list.find((i) => i.el === e.target); if (f) f.visible = e.isIntersecting; })) : null;
  const hex = (c: string) => { let s = (c || "#000").trim().replace("#", ""); if (s.length === 3) s = s.replace(/./g, "$&$&"); const n = parseInt(s, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const palette = (f: Fx) => {
    const k = (f.key === "theme" ? document.documentElement.dataset.palette : f.key) as AccentColor, th = THEMES[k] ?? THEMES.AURORA;
    f.mode = th.fx; f.cols = th.brand.map(hex); f.bg = hex(f.card ? (th.dark ? "#171A1F" : "#FFFFFF") : th.bg);
  };
  const now = () => performance.now() / 1000 * 0.55 + 40;
  const draw = (f: Fx, t: number) => {
    const dpr = Math.min(1.25, devicePixelRatio || 1), w = Math.max(1, Math.round(f.el.clientWidth * dpr)), h = Math.max(1, Math.round(f.el.clientHeight * dpr)), gl = f.gl;
    if (f.el.width !== w || f.el.height !== h) { f.el.width = w; f.el.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(f.u.uRes, w, h); gl.uniform1f(f.u.uTime, still() ? 40 : t); gl.uniform1i(f.u.uMode, f.mode);
    gl.uniform3fv(f.u.uC1, f.cols[0]); gl.uniform3fv(f.u.uC2, f.cols[1]); gl.uniform3fv(f.u.uC3, f.cols[2]); gl.uniform3fv(f.u.uBg, f.bg);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const loop = () => {
    raf = 0;
    if (paused || !list.length) return;
    if (!document.hidden) { const t = now(); list.forEach((f) => { if (f.visible && !still()) draw(f, t); }); }
    raf = requestAnimationFrame(loop);
  };
  const shader = (gl: WebGL2RenderingContext, type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  return {
    mount(el: HTMLCanvasElement, key: string, card: boolean) {
      /* One GL program per canvas, kept across remounts (React StrictMode mounts effects twice in development). */
      let ctx = programs.get(el);
      if (!ctx) {
        const gl = el.getContext("webgl2", { antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
        const v = gl && shader(gl, gl.VERTEX_SHADER, VERT), fr = gl && shader(gl, gl.FRAGMENT_SHADER, FRAG);
        if (!gl || !v || !fr) { el.classList.add("fx-off"); return () => undefined; }
        const p = gl.createProgram()!; gl.attachShader(p, v); gl.attachShader(p, fr); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { el.classList.add("fx-off"); return () => undefined; }
        gl.useProgram(p); gl.bindVertexArray(gl.createVertexArray());
        const u: Fx["u"] = {}; ["uRes", "uTime", "uMode", "uC1", "uC2", "uC3", "uBg"].forEach((n) => { u[n] = gl.getUniformLocation(p, n); });
        ctx = { gl, u }; programs.set(el, ctx);
      }
      const f: Fx = { el, gl: ctx.gl, u: ctx.u, key, card, visible: true, mode: 0, cols: [], bg: [] };
      palette(f); list.push(f); io?.observe(el); draw(f, now());
      requestAnimationFrame(() => el.classList.add("fx-on"));
      if (!raf && !paused) raf = requestAnimationFrame(loop);
      return () => {
        list = list.filter((x) => x !== f); io?.unobserve(el);
        setTimeout(() => { if (!el.isConnected && !list.some((x) => x.el === el)) { ctx!.gl.getExtension("WEBGL_lose_context")?.loseContext(); programs.delete(el); } }, 0);
      };
    },
    refresh() { list.forEach((f) => { palette(f); draw(f, now()); }); },
    pause() { paused = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    resume() { paused = false; if (list.length && !raf) raf = requestAnimationFrame(loop); },
  };
})();

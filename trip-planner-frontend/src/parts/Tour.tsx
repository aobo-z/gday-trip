import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TourStep } from "../lib/tours";
import { still } from "../lib/theme";

const PAD = 6, CARD_W = 300, GAP = 12;

/**
 * Walks through a page's areas: the current one is lit up, the rest dimmed, with a short card beside it.
 * Next / Back / Skip, or arrow keys and Esc. Steps whose target isn't on the page are left out.
 */
export default function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [live] = useState(() => steps.filter((s) => document.querySelector(s.target)));
  const [i, setI] = useState(0), [rect, setRect] = useState<DOMRect | null>(null), [h, setH] = useState(150);
  const card = useRef<HTMLDivElement>(null);
  const step = live[i], last = i === live.length - 1;

  const measure = useCallback(() => {
    const el = step && document.querySelector(step.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  /* Bring the area into view, then light it up (again once a smooth scroll has settled). */
  useLayoutEffect(() => {
    const el = step && document.querySelector(step.target);
    if (!el) return;
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: still() ? "auto" : "smooth" });
    const f = requestAnimationFrame(measure), t = window.setTimeout(measure, 360);
    return () => { cancelAnimationFrame(f); clearTimeout(t); };
  }, [step, measure]);

  useEffect(() => {
    window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [measure]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      else if (e.key === "ArrowRight") { if (last) onDone(); else setI((n) => n + 1); }
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [last, onDone]);

  useEffect(() => { card.current?.focus(); }, [i]);
  useEffect(() => {
    const el = card.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight)); ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => { if (!live.length) onDone(); }, [live.length, onDone]);
  if (!step) return null;

  /* Try below, above, right, then left of the area, taking the first spot where the whole card fits without
     covering it; a tall area (the sidebar) tries the sides first. If nothing fits, the card goes below, kept
     inside the window. */
  const vw = window.innerWidth, vh = window.innerHeight, w = Math.min(CARD_W, vw - 24);
  const r = rect ?? new DOMRect(vw / 2, vh / 2, 0, 0);
  const clampX = (x: number) => Math.max(12, Math.min(x, vw - w - 12)), clampY = (y: number) => Math.max(12, Math.min(y, vh - h - 12));
  const cx = clampX(r.left + r.width / 2 - w / 2), cy = clampY(r.top + Math.min(r.height, vh) / 2 - h / 2);
  const below = { top: r.bottom + PAD + GAP, left: cx, fits: r.bottom + PAD + GAP + h <= vh - 12 };
  const above = { top: r.top - PAD - GAP - h, left: cx, fits: r.top - PAD - GAP - h >= 12 };
  const right = { top: cy, left: r.right + PAD + GAP, fits: r.right + PAD + GAP + w <= vw - 12 };
  const left_ = { top: cy, left: r.left - PAD - GAP - w, fits: r.left - PAD - GAP - w >= 12 };
  const order = r.height > vh * 0.5 ? [right, left_, below, above] : [below, above, right, left_];
  const spot = order.find((o) => o.fits) ?? { top: clampY(below.top), left: cx };
  const { top, left } = spot;

  return createPortal(<div className="tour" role="presentation">
    <div className="tour-block" onClick={(e) => e.stopPropagation()} />
    <div className="tour-spot" aria-hidden="true" style={{ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }} />
    <div ref={card} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" tabIndex={-1} style={{ top, left, width: w }}>
      <span className="tour-count num">{i + 1} / {live.length}</span>
      <b id="tour-title">{step.title}</b>
      <p id="tour-body">{step.body}</p>
      <div className="tour-foot">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Skip</button>
        <span style={{ display: "flex", gap: 6 }}>
          {i > 0 && <button type="button" className="btn btn-outline btn-sm" onClick={() => setI(i - 1)}>Back</button>}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? "Done" : "Next"}</button>
        </span>
      </div>
    </div>
  </div>, document.body);
}

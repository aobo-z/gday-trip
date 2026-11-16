import { useEffect, useLayoutEffect, useRef } from "react";
import { EASE, SPRING, still } from "../lib/theme";

/* ---------- Sliding marker: one pill follows the active item (React Bits RubberSegment idea) ---------- */
const marks: Record<string, { x: number; y: number; w: number; h: number }> = {};
export function useSlide(key: string, deps: unknown[], rubber = true) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    el.dataset.slide = key;
    let mk = el.querySelector<HTMLElement>(":scope > .mk");
    if (!mk) { mk = document.createElement("i"); mk.className = "mk"; mk.setAttribute("aria-hidden", "true"); el.prepend(mk); }
    const act = el.querySelector<HTMLElement>('[aria-pressed="true"], [aria-current="page"]');
    if (!act || !act.offsetWidth) { mk.style.opacity = "0"; delete marks[key]; return; }
    const b = el.getBoundingClientRect(), a = act.getBoundingClientRect();
    const to = { x: a.left - b.left + el.scrollLeft - el.clientLeft, y: a.top - b.top + el.scrollTop - el.clientTop, w: a.width, h: a.height };
    const from = marks[key]; marks[key] = to;
    const at = (s: typeof to) => ({ width: s.w + "px", height: s.h + "px", transform: `translate(${s.x}px,${s.y}px)` });
    Object.assign(mk.style, at(to)); mk.style.opacity = "1";
    if (!from || still() || (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1 && Math.abs(from.w - to.w) < 1)) return;
    const frames: Keyframe[] = [at(from)];
    if (rubber && Math.abs(from.y - to.y) < 2) {
      /* Leading edge arrives first, trailing edge catches up: the stretch reads as direction. */
      const right = to.x > from.x, x = right ? from.x + (to.x - from.x) * 0.15 : to.x, end = right ? to.x + to.w : from.x + from.w - (from.x - to.x) * 0.15;
      frames.push({ ...at({ x, y: to.y, w: end - x, h: to.h }), offset: 0.45 });
    }
    frames.push(at(to));
    mk.animate(frames, { duration: frames.length > 2 ? 440 : 380, easing: frames.length > 2 ? EASE : SPRING });
  });
  useEffect(() => {
    const el = box.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { const act = el.querySelector<HTMLElement>('[aria-pressed="true"], [aria-current="page"]'); const mk = el.querySelector<HTMLElement>(":scope > .mk"); if (!act || !mk) return; const b = el.getBoundingClientRect(), a = act.getBoundingClientRect(); const to = { x: a.left - b.left + el.scrollLeft, y: a.top - b.top + el.scrollTop, w: a.width, h: a.height }; marks[key] = to; Object.assign(mk.style, { width: to.w + "px", height: to.h + "px", transform: `translate(${to.x}px,${to.y}px)` }); });
    ro.observe(el); return () => ro.disconnect();
  }, [key]);
  void deps;
  return box;
}


import type { ActivityResponse } from "../api/activityApi";

/* Day timeline geometry: hours shown and the order of a day's plans. */
export const H0 = 6, H1 = 23;
export function dayActs(list: ActivityResponse[], day: string) {
  return list.filter((a) => a.date === day && a.startTime).sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1));
}
/**
 * Opens the day timeline where it matters: a plan under way right now shows from its start (so its title is
 * visible, however long it runs), otherwise just above the "now" line, else the first plan, else 9:00.
 */
export function scrollTimeline(el: HTMLDivElement | null) {
  if (!el) return;
  const evs = [...el.querySelectorAll<HTMLElement>(".ev")], now = el.querySelector<HTMLElement>(".nowline"), grid = el.querySelector<HTMLElement>(".tl-grid");
  const pxh = Number(grid?.dataset.pxh ?? 60);
  const running = now ? evs.filter((e) => e.offsetTop <= now.offsetTop && e.offsetTop + e.offsetHeight >= now.offsetTop) : [];
  const top = running.length ? Math.min(...running.map((e) => e.offsetTop)) - 24 : now ? now.offsetTop - 120 : evs.length ? Math.min(...evs.map((e) => e.offsetTop)) - 24 : (9 - H0) * pxh;
  el.scrollTop = Math.max(0, top);
}

/** Navigation state that opens the Schedule at one plan: its day and time, flashing the event (or the waiting list item). */
export interface Jump { focus: number; day?: string; time?: string; scheduled: boolean }

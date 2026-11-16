/* Dates, times and money. The backend sends ISO dates ("2026-10-24"), times ("09:30:00") and timestamps. */

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function pd(s: string) { const p = s.slice(0, 10).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
export function iso(d: Date) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
/** "1 day", "3 days": a count with its word in the right number. */
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
/** Just the word for a count, when the number is rendered separately. */
export const unit = (n: number, one: string, many = one + "s") => (n === 1 ? one : many);
export function today() { return iso(new Date()); }
export function addDays(s: string, n: number) { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); }
export function dayDiff(a: string, b: string) { return Math.round((pd(b).getTime() - pd(a).getTime()) / 86400000); }
export function daysBetween(a: string, b: string) { const out: string[] = []; for (let i = 0; i <= dayDiff(a, b); i++) out.push(addDays(a, i)); return out; }
export function fd(s: string) { const d = pd(s); return d.getDate() + " " + MON[d.getMonth()]; }
export function fdy(s: string) { const d = pd(s); return d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear(); }
export function fwd(s: string) { return WD[pd(s).getDay()]; }
export function frange(a: string, b: string) {
  const x = pd(a), y = pd(b);
  if (x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear()) return x.getDate() + "–" + y.getDate() + " " + MON[y.getMonth()];
  return fd(a) + " – " + fd(b);
}
/** "2026-10-24T09:30:12" → "24 Oct, 09:30". */
export function fdt(s: string) { const d = new Date(s); return d.getDate() + " " + MON[d.getMonth()] + ", " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
export function ago(s: string) {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 60) return Math.max(1, m) + "m";
  if (m < 1440) return Math.round(m / 60) + "h";
  if (m < 1440 * 30) return Math.round(m / 1440) + "d";
  return fd(s);
}
/** "09:30:00" → "09:30". */
export function hm(t: string | null | undefined) { return t ? t.slice(0, 5) : ""; }
export function toMin(t: string) { const p = t.split(":"); return +p[0] * 60 + +p[1]; }
export function fromMin(m: number) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
export function nowTime() { const d = new Date(); return fromMin(d.getHours() * 60 + d.getMinutes()); }

/** Exactly the backend's CurrencyService.CODES: offering any other code would only fail when the form is saved. */
export const CURRENCIES = ["AUD", "USD", "EUR", "GBP", "NZD", "JPY", "CNY", "SGD", "HKD", "CAD"];
const SYM: Record<string, string> = { AUD: "A$", USD: "US$", EUR: "€", GBP: "£", NZD: "NZ$", JPY: "¥", CNY: "CN¥", SGD: "S$", HKD: "HK$", KRW: "₩", IDR: "Rp", CAD: "C$", INR: "₹" };
const NO_CENTS = new Set(["JPY", "KRW", "IDR", "VND"]);
export function money(n: number, cur: string, opt?: { short?: boolean }) {
  let d = NO_CENTS.has(cur) ? 0 : 2;
  if (opt?.short && Math.abs(n) >= 1000) d = 0;
  const s = Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: d, maximumFractionDigits: d });
  return (n < 0 ? "−" : "") + (SYM[cur] ?? cur + " ") + s;
}
export const moneyFmt = (cur: string) => (v: number) => money(v, cur);
export function r2(n: number) { return Math.round(n * 100) / 100; }
export function sum(a: number[]) { return a.reduce((x, y) => x + y, 0); }
/** Whole cents from a typed amount, or null when it isn't a positive number with at most two decimals. */
export function cents(v: unknown) {
  const s = String(v ?? "").trim();
  return /^\d+(\.\d{1,2})?$/.test(s) ? Math.round(+s * 100) : null;
}
/** First two characters, counted as whole characters so an emoji or accented letter is never cut in half. */
export function initials(name: string) { return (Array.from((name || "").replace(/\s+/g, "")).slice(0, 2).join("") || "?").toUpperCase(); }
const AVATAR = ["#2F6BEA", "#E2723A", "#1F9D63", "#7C5CF0", "#D2447A", "#0E9AA7", "#8A6D3B", "#5B6B7F", "#C8673F", "#3F74AD"];
/** A stable colour per user, since the backend stores none. */
export function userColor(id: number) { return AVATAR[Math.abs(id) % AVATAR.length]; }

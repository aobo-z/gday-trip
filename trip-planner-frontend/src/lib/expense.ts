/* Expense categories and colours shared by the overview and the Expenses page (same set as the backend's default list). */
export const EXP_CATS = ["Food", "Transport", "Lodging", "Culture", "Activities", "Other"];
export const EXP_COLOR: Record<string, string> = { Food: "#C8673F", Transport: "#0F907C", Lodging: "#3F74AD", Culture: "#8A5AA6", Activities: "#B9891C", Other: "#6B7280" };
export const EXP_ICON: Record<string, string> = { Food: "utensils", Transport: "bus", Lodging: "bed", Culture: "landmark", Activities: "ticket", Other: "receipt" };
export const expCategory = (c: string | null | undefined) => c?.trim() || "Other";
/** Legacy or custom categories keep a stable muted colour. */
export function catColor(c: string) {
  if (EXP_COLOR[c]) return EXP_COLOR[c];
  let h = 0; for (let i = 0; i < c.length; i++) h = (Math.imul(h, 31) + c.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 30% 45%)`;
}
export const shareLabel = (p: number) => (p > 0 && p < 0.1 ? "<0.1%" : p.toFixed(1) + "%");

export type Money = (nBase: number) => string;

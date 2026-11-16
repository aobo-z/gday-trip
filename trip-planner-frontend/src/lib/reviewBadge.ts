import { useEffect, useState } from "react";
import { fetchReviewableMembers } from "../api/reviewApi";
import type { TripResponse } from "../api/tripApi";
import { finished } from "./domain";

/* Hooks to tell when a review was just sent, so their badge counts again. */
const listeners = new Set<() => void>();

/**
 * How many fellow travellers on finished trips are still waiting for my review (the sidebar badge). Counted
 * again when the set of finished trips changes or after a review is sent. Nothing is shared between hook
 * instances or sessions, so another account signing in never sees this one's count.
 */
export function useReviewBadge(trips: TripResponse[]) {
  const [count, setCount] = useState<{ key: string; n: number } | null>(null), [version, setVersion] = useState(0);
  const key = trips.filter(finished).map((t) => t.tripId).sort((a, b) => a - b).join(",");
  useEffect(() => { const bump = () => setVersion((v) => v + 1); listeners.add(bump); return () => { listeners.delete(bump); }; }, []);
  useEffect(() => {
    if (!key) return;
    let live = true;
    Promise.all(key.split(",").map((id) => fetchReviewableMembers(Number(id)).catch(() => [])))
      .then((lists) => { if (live) setCount({ key, n: lists.flat().filter((m) => !m.alreadyReviewed).length }); });
    return () => { live = false; };
  }, [key, version]);
  return key && count?.key === key ? count.n : 0;
}
/** Call after sending a review so every badge counts again. */
export function resetReviewBadge() { listeners.forEach((bump) => bump()); }

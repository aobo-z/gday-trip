import { useRef } from "react";
import { saveActivityVote, withdrawActivityVote, type ActivityResponse } from "../api/activityApi";
import { apiErrorMessage } from "../api/apiError";
import { useTrip } from "../lib/stores";
import { useOverlay } from "../ui/overlayContext";

/**
 * Save my vote; tapping the vote I already gave takes it back. The button and counts change at once (the server's
 * answer then replaces the guess, or the old state comes back with a toast), and a tap while a vote is saving is ignored.
 */
export function useVote() {
  const store = useTrip(), o = useOverlay(), pending = useRef(new Set<number>());
  return async (a: ActivityResponse, vote: "APPROVE" | "REJECT") => {
    if (pending.current.has(a.id)) return;
    pending.current.add(a.id);
    const was = a.currentUserVote, next = was === vote ? null : vote;
    const delta = (v: "APPROVE" | "REJECT") => (next === v ? 1 : 0) - (was === v ? 1 : 0);
    store.putActivities([{ ...a, currentUserVote: next, approveCount: a.approveCount + delta("APPROVE"), rejectCount: a.rejectCount + delta("REJECT") }]);
    try { store.putActivities([await (next ? saveActivityVote(a.id, next) : withdrawActivityVote(a.id))]); }
    catch (e) { store.putActivities([a]); o.toast(apiErrorMessage(e, "Vote not saved")); }
    finally { pending.current.delete(a.id); }
  };
}

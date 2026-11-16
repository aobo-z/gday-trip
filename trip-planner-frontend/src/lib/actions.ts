import { deleteActivity, updateActivitySchedule, type ActivityResponse } from "../api/activityApi";
import { createBranchPlan, removeBranch } from "../api/branchPlanningApi";
import { apiErrorMessage } from "../api/apiError";
import type { TripStore } from "./stores";
import type { Overlay } from "../ui/overlayContext";

/** A branch goes back to voting (DELETE /activities/{id}/branch); undo makes it a branch again at the same time. */
export async function unbranch(store: TripStore, o: Overlay, a: ActivityResponse) {
  try {
    await removeBranch(a.id); await store.refreshActivities();
    o.toast(a.name + " back to voting", async () => {
      try { await createBranchPlan(store.trip.tripId, { sourceActivityId: a.id, name: a.name, location: a.location, category: a.category, date: a.date, startTime: a.startTime, endTime: a.endTime }); }
      catch (e) { o.toast(apiErrorMessage(e, "Could not undo")); }
      await store.refreshActivities();
    });
    return true;
  } catch (e) { o.toast(apiErrorMessage(e, "Could not change this branch")); return false; }
}

/** Deletes a group activity after a hold-to-confirm, whichever page asked. */
export async function removeActivity(store: TripStore, o: Overlay, a: ActivityResponse) {
  const body = (a.date ? "It comes off the schedule for good. " : "") + "Its votes, comments and preferred times are deleted too. Linked expenses stay, without the link."
    + (a.date ? " To keep it, unschedule it instead." : "");
  if (!(await o.confirm({ title: `Delete ${a.name}?`, body, label: "Delete", danger: true }))) return false;
  try { await deleteActivity(a.id); }
  catch (e) { o.toast(apiErrorMessage(e, "Could not delete")); return false; }
  o.toast("Deleted " + a.name);
  // Deleted already: a failed refresh shouldn't read as a failed delete.
  await store.refreshActivities().catch(() => o.toast("Deleted, but the list didn't refresh. Reload to update it."));
  return true;
}

/**
 * Put a plan on the calendar, move it, or take it off (date null) via PUT /activities/{id}/schedule.
 * Members are only sent when an owner picks them; otherwise the backend keeps or defaults them.
 * Afterwards every activity is fetched again, because moving a branch changes who goes to what it overlaps.
 */
export async function schedulePlan(store: TripStore, a: ActivityResponse, slot: { date: string | null; startTime: string | null; endTime: string | null; memberIds?: number[] }) {
  await updateActivitySchedule(a.id, slot.date ? slot : { date: null, startTime: null, endTime: null });
  await store.refreshActivities();
}

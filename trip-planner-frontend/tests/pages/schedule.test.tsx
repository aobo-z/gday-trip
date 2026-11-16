import { describe, expect, test, vi } from "vitest";
import { within } from "@testing-library/react";
import { renderApp, screen, waitFor, dialog, drawer, toastText } from "../render";
import { server } from "../server";
import { activity, day, ME, scheduled, seedTrip } from "../fixtures";

describe("Schedule", () => {
  test("the day's plans sit on the timeline and the header counts them", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [scheduled(t, day(0), "09:00", "11:30", { name: "Coastal walk" }), scheduled(t, day(1), "10:00", "11:00", { name: "Tomorrow thing" })];
    await renderApp(`/trip/${t.tripId}/schedule`);
    expect(screen.getByRole("button", { name: /Coastal walk/ })).toHaveTextContent("09:00–11:30");
    expect(screen.queryByText("Tomorrow thing")).toBeNull();
    expect(document.querySelector(".card .figs")!.textContent).toBe("1");
  });

  test("approved activities wait in To schedule; clicking one opens its details (times are set by dragging)", async () => {
    const t = seedTrip(server.db);
    const a = activity(t, { name: "Evening market", status: "APPROVED" });
    server.db.activities[t.tripId] = [a];
    const { user } = await renderApp(`/trip/${t.tripId}/schedule`);
    const pool = document.querySelector<HTMLElement>('[data-pool-drop="ideas"]')!;
    await user.click(within(pool).getByRole("button", { name: /Evening market/ }));
    expect(within(drawer()!).getByRole("heading", { level: 2 })).toHaveTextContent("Evening market");
    expect(dialog()).toBeNull();
  });

  test("anyone can move a branch someone else made; a group plan they can't change stays put", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [scheduled(t, day(0), "10:00", "11:00", { name: "Their branch", branch: true, status: "BRANCH", canModify: false, canSchedule: false }),
      scheduled(t, day(0), "12:00", "13:00", { name: "Locked plan", canModify: false, canSchedule: false })];
    await renderApp(`/trip/${t.tripId}/schedule`);
    const ev = (name: string) => screen.getByRole("button", { name: new RegExp(name) });
    expect(ev("Their branch").querySelector(".ev-resize")).not.toBeNull();
    expect(ev("Locked plan").querySelector(".ev-resize")).toBeNull();
  });

  test("Branches lists only branches waiting for a time, never rejected activities", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [activity(t, { name: "Kept branch", branch: true, status: "BRANCH" }), activity(t, { name: "Rejected idea", status: "REJECTED" })];
    await renderApp(`/trip/${t.tripId}/schedule`);
    const pool = document.querySelector<HTMLElement>('[data-pool-drop="branches"]')!;
    expect(within(pool).getByText("Kept branch")).toBeInTheDocument();
    expect(within(pool).queryByText("Rejected idea")).toBeNull();
  });

  test("a new branch can start from a rejected activity: that same activity becomes the branch", async () => {
    const t = seedTrip(server.db);
    const rejected = activity(t, { name: "Harbour kayak", status: "REJECTED", rejectCount: 2 });
    server.db.activities[t.tripId] = [rejected, activity(t, { name: "Approved one", status: "APPROVED" })];
    const { user } = await renderApp(`/trip/${t.tripId}/schedule`);
    await user.click(screen.getAllByRole("button", { name: "New branch" })[0]);
    const d = dialog()!;
    expect(within(d).queryByRole("button", { name: /Approved one/ })).toBeNull();
    await user.click(within(d).getByRole("button", { name: /Harbour kayak/ }));
    expect(within(d).queryByLabelText("Name")).toBeNull();
    await user.click(within(d).getByRole("button", { name: /Add branch/ }));
    await waitFor(() => expect(server.sent("post", `/trips/${t.tripId}/branches`)[0]?.body).toMatchObject({ sourceActivityId: rejected.id, date: null, startTime: null }));
    await waitFor(() => expect(within(document.querySelector<HTMLElement>('[data-pool-drop="branches"]')!).getByText("Harbour kayak")).toBeInTheDocument());
    expect(server.db.activities[t.tripId]).toHaveLength(2);
  });

  test("a branch's window sends it back to voting", async () => {
    const t = seedTrip(server.db);
    const b = scheduled(t, day(0), "10:00", "11:00", { name: "Side trip", branch: true, status: "BRANCH", memberIds: [ME.userId] });
    server.db.activities[t.tripId] = [b];
    const { user } = await renderApp(`/trip/${t.tripId}/schedule`);
    await user.click(screen.getByRole("button", { name: /Side trip/ }));
    await user.click(within(drawer()!).getByRole("button", { name: /Back to voting/ }));
    await waitFor(() => expect(server.sent("delete", `/activities/${b.id}/branch`)).toHaveLength(1));
    await waitFor(() => expect(toastText()).toContain("Side trip back to voting"));
  });

  test("+ Branch from a plan puts the branch at that plan's time, under Same time", async () => {
    const t = seedTrip(server.db);
    const plan = scheduled(t, day(0), "10:00", "12:00", { name: "Museum" });
    const src = activity(t, { name: "Harbour kayak", status: "REJECTED" });
    server.db.activities[t.tripId] = [plan, src];
    const { user } = await renderApp(`/trip/${t.tripId}/schedule`);
    await user.click(screen.getByRole("button", { name: /Museum/ }));
    await user.click(within(drawer()!).getByRole("button", { name: /Branch/ }));
    await user.click(within(dialog()!).getByRole("button", { name: /Harbour kayak/ }));
    await user.click(within(dialog()!).getByRole("button", { name: /Add branch/ }));
    await waitFor(() => expect(server.sent("post", `/trips/${t.tripId}/branches`)[0]?.body).toMatchObject({ sourceActivityId: src.id, date: day(0), startTime: "10:00:00", endTime: "12:00:00" }));
    await waitFor(() => expect(within(drawer()!).getByRole("button", { name: /Harbour kayak/ })).toBeInTheDocument());
    expect(within(drawer()!).queryByText("Nothing else")).toBeNull();
  });

  test("preferred-time bands only appear while dragging, not on hover", async () => {
    const t = seedTrip(server.db);
    const a = activity(t, { name: "Evening market", status: "APPROVED" });
    server.db.activities[t.tripId] = [a];
    server.db.prefs[a.id] = { activityId: a.id, eligibleMemberCount: 2, respondingMemberCount: 1, currentUserPreferences: [], slots: [{ preferredDate: day(0), preferredStartTime: "18:00:00", preferredEndTime: "20:00:00", memberCount: 1 }] };
    const { user } = await renderApp(`/trip/${t.tripId}/schedule`);
    await user.hover(screen.getByRole("button", { name: /Evening market/ }));
    expect(document.querySelector(".pref-band, .pref-rail")).toBeNull();
  });

  test("Export makes an .ics with only the plans I'm going to", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [scheduled(t, day(0), "09:00", "10:00", { name: "Mine", memberIds: [ME.userId] }), scheduled(t, day(1), "09:00", "10:00", { name: "Not mine", memberIds: [2] })];
    const { user } = await renderApp(`/trip/${t.tripId}/schedule`);
    await user.click(screen.getByRole("button", { name: "Export" }));
    const d = dialog()!;
    expect(within(d).getByText("Events").closest(".kv")!.querySelector(".num")!.textContent).toBe("1");
    expect(within(d).queryByRole("checkbox")).toBeNull();
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await user.click(within(d).getByRole("button", { name: /Download/ }));
    expect(download).toHaveBeenCalledOnce();
    await waitFor(() => expect(dialog()).toBeNull());
  });

  test("clicking an event opens its plan with who's going", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [scheduled(t, day(0), "09:00", "10:00", { name: "Coastal walk" })];
    const { user } = await renderApp(`/trip/${t.tripId}/schedule`);
    await user.click(screen.getByRole("button", { name: /Coastal walk/ }));
    expect(within(drawer()!).getByRole("heading", { name: "Coastal walk" })).toBeInTheDocument();
    expect(within(drawer()!).getByRole("button", { name: "Leave" })).toBeInTheDocument();
  });

  test("an activity that was on the calendar goes back to To schedule, not voting, even if its votes changed since", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [activity(t, { name: "Night market", status: "PENDING", canSchedule: true })];
    await renderApp(`/trip/${t.tripId}/schedule`);
    expect(within(document.querySelector<HTMLElement>('[data-pool-drop="ideas"]')!).getByText("Night market")).toBeInTheDocument();
    expect(screen.queryByText(/still voting/)).toBeNull();
  });

  test("any member who can place a plan can unschedule it too, and the toast says where it went", async () => {
    const t = seedTrip(server.db);
    const a = scheduled(t, day(0), "10:00", "11:00", { name: "Ferry ride", canModify: false, canSchedule: true });
    server.db.activities[t.tripId] = [a];
    const { user } = await renderApp(`/trip/${t.tripId}/schedule`);
    await user.click(screen.getByRole("button", { name: /Ferry ride/ }));
    expect(within(drawer()!).queryByRole("button", { name: "Delete activity" })).toBeNull();
    await user.click(within(drawer()!).getByRole("button", { name: /Unschedule/ }));
    await waitFor(() => expect(server.sent("put", `/activities/${a.id}/schedule`)[0]?.body).toMatchObject({ date: null }));
    await waitFor(() => expect(toastText()).toContain("Ferry ride back to To schedule"));
  });

  test("deleting a scheduled plan asks first and points to unscheduling instead", async () => {
    const t = seedTrip(server.db);
    const a = scheduled(t, day(0), "10:00", "11:00", { name: "Ferry ride" });
    server.db.activities[t.tripId] = [a];
    const { user } = await renderApp(`/trip/${t.tripId}/schedule`);
    await user.click(screen.getByRole("button", { name: /Ferry ride/ }));
    await user.click(within(drawer()!).getByRole("button", { name: "Delete activity" }));
    expect(dialog()!).toHaveTextContent("To keep it, unschedule it instead.");
    expect(dialog()!).toHaveTextContent("Linked expenses stay");
    expect(server.sent("delete", `/activities/${a.id}`)).toHaveLength(0);
  });
});

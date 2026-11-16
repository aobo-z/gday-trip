import { describe, expect, test } from "vitest";
import { fireEvent, within } from "@testing-library/react";
import { renderApp, screen, waitFor, dialog, toastText } from "../render";
import { server } from "../server";
import { day, member, ME, seedTrip, TOM } from "../fixtures";

describe("Leave trip", () => {
  test("a member leaves after holding to confirm, and lands on their next trip", async () => {
    const other = seedTrip(server.db, { name: "Kyoto autumn", startDate: day(20), endDate: day(25) });
    const t = seedTrip(server.db, { name: "Tom's Bali", role: "MEMBER" });
    server.db.members[t.tripId] = [member(t, TOM, { role: "OWNER" }), member(t, ME)];
    server.on("delete", "/trips/:id/members/:mid", (q) => { server.db.members[t.tripId] = server.db.members[t.tripId].filter((m) => m.tripMemberId !== Number(q.params.mid)); server.db.trips = server.db.trips.filter((x) => x.tripId !== t.tripId); return null; });
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(screen.getByRole("button", { name: "Leave trip" }));
    const d = dialog()!;
    expect(within(d).getByRole("heading", { name: "Leave Tom's Bali?" })).toBeInTheDocument();
    fireEvent.keyDown(within(d).getByRole("button", { name: /hold to leave trip/i }), { key: "Enter" });
    await waitFor(() => expect(window.location.pathname).toBe(`/trip/${other.tripId}/overview`), { timeout: 4000 });
    expect(toastText()).toContain("You left Tom's Bali");
  });

  test("the last owner is told to hand over ownership first; nothing is sent", async () => {
    const t = seedTrip(server.db);
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    const leave = screen.getByRole("button", { name: "Leave trip" });
    expect(leave).toHaveAttribute("aria-disabled", "true");
    await user.click(leave);
    expect(toastText()).toContain("Make another traveller an owner before you leave");
    expect(dialog()).toBeNull();
    expect(server.sent("delete", /\/members\//)).toHaveLength(0);
  });

  test("a sole traveller is pointed to deleting the trip instead", async () => {
    const t = seedTrip(server.db);
    server.db.members[t.tripId] = [member(t, ME, { role: "OWNER" })];
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(screen.getByRole("button", { name: "Leave trip" }));
    expect(toastText()).toContain("delete the trip");
  });
});

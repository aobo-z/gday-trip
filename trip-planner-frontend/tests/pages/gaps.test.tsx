/* The parts the first round of page tests didn't reach: settling up, managing members, scheduling and
   branches from their dialogs, and joining with a code. */
import { describe, expect, test } from "vitest";
import { fireEvent, within } from "@testing-library/react";
import { renderApp, screen, waitFor, dialog, drawer, toastText } from "../render";
import { reply, server } from "../server";
import { activity, day, member, ME, scheduled, seedTrip, TOM, trip } from "../fixtures";
import { fwd, pd } from "../../src/lib/format";

describe("Balances and settling up", () => {
  async function openBalances() {
    const t = seedTrip(server.db);
    server.on("get", "/trips/:id/balances", () => ({ netBalance: -30, totalYouOwe: 30, totalYouAreOwed: 0, youOwe: [{ userId: TOM.userId, name: TOM.username, amount: 30 }], youAreOwed: [],
      eligiblePayees: [{ userId: TOM.userId, name: TOM.username, amount: 30 }] }));
    server.on("get", "/trips/:id/balances/simplified", () => ({ currency: "AUD", originalPairwiseRelationships: 1, baselineSimplifiedRelationships: 1,
      transfers: [{ fromUserId: ME.userId, fromName: ME.username, toUserId: TOM.userId, toName: TOM.username, amount: 30 }], originalDebts: [] }));
    const r = await renderApp(`/trip/${t.tripId}/expenses`);
    await r.user.click(await screen.findByRole("button", { name: "Balances" }));
    return { t, ...r };
  }

  test("a suggested transfer pre-fills the payment; going over the net limit is refused before saving", async () => {
    let posted: unknown = null;
    server.on("post", "/trips/:id/settlements", (q) => { posted = q.body; return { settlementId: 1 }; });
    const { user } = await openBalances();
    const transfer = (await screen.findByText("Simplified Debts")).closest("section")!;
    await user.click(within(transfer).getByRole("button", { name: "Record Payment" }));
    const amount = within(dialog()!).getByLabelText(/Amount/);
    expect(amount).toHaveValue(30);
    await user.clear(amount); await user.type(amount, "45");
    await user.click(within(dialog()!).getByRole("button", { name: "Record Payment" }));
    expect(within(dialog()!).getByText(/net payment limit is A\$30.00/)).toBeInTheDocument();
    await user.clear(amount); await user.type(amount, "30");
    await user.click(within(dialog()!).getByRole("button", { name: "Record Payment" }));
    await waitFor(() => expect(posted).toEqual({ payeeId: TOM.userId, amount: "30" }));
    expect(toastText()).toContain("Payment saved.");
  });

  test("when everything is settled the transfers say so", async () => {
    const t = seedTrip(server.db);
    const { user } = await renderApp(`/trip/${t.tripId}/expenses`);
    await user.click(await screen.findByRole("button", { name: "Balances" }));
    expect(await screen.findByText("All net balances are settled.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Record Payment/ })[0]).toBeDisabled();
  });
});

describe("Travellers", () => {
  test("an owner invites by email (checked first), switches a role and removes a member after confirming", async () => {
    const t = seedTrip(server.db);
    server.on("post", "/trips/:id/members/invite", (q) => { const m = member(t, { userId: 9, username: "Lena" }, { inviteStatus: "PENDING", email: q.body.email }); server.db.members[t.tripId].push(m); return m; });
    server.on("put", "/trips/:id/members/:mid/role", (q) => { const m = server.db.members[t.tripId].find((x) => x.tripMemberId === Number(q.params.mid))!; m.role = q.body.role; return m; });
    server.on("delete", "/trips/:id/members/:mid", (q) => { server.db.members[t.tripId] = server.db.members[t.tripId].filter((x) => x.tripMemberId !== Number(q.params.mid)); return null; });
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(screen.getByRole("button", { name: "Invite" }));
    const d = dialog()!;
    await waitFor(() => expect(within(d).getByText("ABC123")).toBeInTheDocument());
    await user.type(within(d).getByLabelText("Invite by email"), "lena@");
    await user.click(within(d).getByRole("button", { name: /Send/ }));
    expect(within(d).getByText("Enter a valid email")).toBeInTheDocument();
    await user.type(within(d).getByLabelText("Invite by email"), "example.test");
    await user.click(within(d).getByRole("button", { name: /Send/ }));
    await waitFor(() => expect(screen.getByText("Invite sent")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: `${TOM.username} is a member, switch` }));
    await waitFor(() => expect(screen.getByRole("button", { name: `${TOM.username} is an owner, switch` })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: `Remove ${TOM.username}` }));
    expect(within(dialog()!).getByRole("heading", { name: `Remove ${TOM.username}?` })).toBeInTheDocument();
  });

  test("owners switch other members' roles; their own role has no switch", async () => {
    const t = seedTrip(server.db);
    server.db.members[t.tripId][1].role = "OWNER";
    server.db.members[t.tripId] = [server.db.members[t.tripId][0], member(t, TOM)];
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    expect(screen.queryByRole("button", { name: `${ME.username} is an owner, switch` })).toBeNull();
    await user.click(screen.getByRole("button", { name: `${TOM.username} is a member, switch` }));
    await waitFor(() => expect(server.sent("put", /\/role$/)).toHaveLength(1));
  });
});

describe("Scheduling and branch dialogs", () => {
  test("scheduling checks the times and refuses an overlap with another plan", async () => {
    const t = seedTrip(server.db, { startDate: day(0), endDate: day(2) });
    const a = scheduled(t, day(1), "18:00", "19:00", { name: "Evening market" });
    server.db.activities[t.tripId] = [a, scheduled(t, day(0), "10:00", "12:00", { name: "Coastal walk" })];
    const { user } = await renderApp(`/trip/${t.tripId}/schedule`);
    await user.click(screen.getByRole("button", { name: new RegExp(fwd(day(1))) }));
    await user.click(await screen.findByRole("button", { name: /Evening market/ }));
    await user.click(within(drawer()!).getByRole("button", { name: /Change/ }));
    const d = dialog()!;
    await user.click(within(d).getByRole("button", { name: fwd(day(0)) + " " + pd(day(0)).getDate() }));
    fireEvent.change(within(d).getByRole("slider", { name: "From" }), { target: { value: String(11 * 60) } });
    await user.click(within(d).getByRole("button", { name: /^Schedule/ }));
    expect(within(d).getByText(/Overlaps Coastal walk/)).toBeInTheDocument();
    expect(server.sent("put", `/activities/${a.id}/schedule`)).toHaveLength(0);
  });

  test("New branch: New place opens the form for a branch at the plan's time (no vote); picking an activity puts it at the same time as the plan", async () => {
    const t = seedTrip(server.db);
    const parent = scheduled(t, day(0), "10:00", "12:00", { name: "Coastal walk" });
    const rejected = activity(t, { name: "Harbour kayak", status: "REJECTED" });
    server.db.activities[t.tripId] = [parent, rejected];
    const { user } = await renderApp(`/trip/${t.tripId}/schedule`);
    await user.click(screen.getByRole("button", { name: /Coastal walk/ }));
    await user.click(within(drawer()!).getByRole("button", { name: /^Branch$/ }));
    let d = dialog()!;
    expect(within(d).queryByRole("slider")).toBeNull();
    await user.click(within(d).getByRole("button", { name: /Create activity/ }));
    await waitFor(() => expect(within(dialog()!).getByRole("heading", { name: "New branch" })).toBeInTheDocument());
    expect(within(dialog()!).queryByLabelText("Day")).toBeNull();
    expect(within(dialog()!).getByRole("button", { name: "Add branch" })).toBeInTheDocument();
    await user.type(within(dialog()!).getByLabelText("Name"), "Rock pools");
    await user.type(within(dialog()!).getByLabelText("Location"), "Bondi");
    await user.click(within(dialog()!).getByRole("button", { name: "Add branch" }));
    await waitFor(() => expect(server.sent("post", `/trips/${t.tripId}/branches`)[0]?.body).toMatchObject({ name: "Rock pools", date: day(0), startTime: "10:00:00", endTime: "12:00:00" }));
    expect(server.sent("post", `/trips/${t.tripId}/activities`)).toHaveLength(0);
    await user.click(within(drawer()!).getByRole("button", { name: /^Branch$/ }));
    d = dialog()!;
    await user.click(within(d).getByRole("button", { name: /Harbour kayak/ }));
    await user.click(within(d).getByRole("button", { name: /Add branch/ }));
    await waitFor(() => expect(server.sent("post", `/trips/${t.tripId}/branches`)[1]?.body).toMatchObject({ sourceActivityId: rejected.id, date: day(0), startTime: "10:00:00", endTime: "12:00:00" }));
  });
});

describe("Join with code", () => {
  test("find a trip by code, then join it; a wrong code says so", async () => {
    seedTrip(server.db);
    const theirs = trip({ name: "Tom's Bali", role: "MEMBER" });
    server.on("get", "/trips/join/:code", (q) => q.params.code === "BALI2026"
      ? { tripId: theirs.tripId, name: theirs.name, destination: "Bali", startDate: theirs.startDate, endDate: theirs.endDate, status: "PLANNING", memberCount: 2, alreadyMember: false }
      : reply(404, { message: "No trip with this code" }));
    server.on("post", "/trips/join/:code", () => { server.db.trips.push(theirs); server.db.members[theirs.tripId] = []; return {}; });
    const { user } = await renderApp("/trips");
    await user.click(screen.getByRole("button", { name: /Join with code/ }));
    const d = dialog()!;
    await user.type(within(d).getByLabelText("Invite code"), "nope");
    await user.click(within(d).getByRole("button", { name: "Find trip" }));
    expect(await within(d).findByText("No trip with this code")).toBeInTheDocument();
    await user.clear(within(d).getByLabelText("Invite code"));
    await user.type(within(d).getByLabelText("Invite code"), "bali2026");
    await user.click(within(d).getByRole("button", { name: "Find trip" }));
    expect(await within(d).findByText("Tom's Bali")).toBeInTheDocument();
    await user.click(within(d).getByRole("button", { name: "Join trip" }));
    await waitFor(() => expect(window.location.pathname).toBe(`/trip/${theirs.tripId}/overview`));
  });
});

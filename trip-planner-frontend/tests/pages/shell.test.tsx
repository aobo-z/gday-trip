import { describe, expect, test } from "vitest";
import { within } from "@testing-library/react";
import { renderApp, screen, waitFor } from "../render";
import { server } from "../server";
import { activity, day, member, seedTrip, trip } from "../fixtures";

describe("Shell: sidebar, trip switcher, search, notifications", () => {
  test("the trip switcher shows only on trip pages and lists active trips by start date", async () => {
    const late = seedTrip(server.db, { name: "Late trip", startDate: day(60), endDate: day(62) });
    seedTrip(server.db, { name: "Soon trip", startDate: day(5), endDate: day(8) });
    seedTrip(server.db, { name: "Done trip", startDate: day(-60), endDate: day(-55), status: "ARCHIVED" });
    const { user } = await renderApp(`/trip/${late.tripId}/overview`);
    await user.click(screen.getByRole("button", { name: /Late trip/ }));
    const menu = screen.getByRole("menu");
    const names = within(menu).getAllByRole("menuitemradio").map((b) => b.querySelector(".trip-menu-text")!.firstChild!.textContent);
    expect(names).toEqual(["Soon trip", "Late trip"]);
    await user.click(screen.getByRole("button", { name: /Community/ }));
    await waitFor(() => expect(document.querySelector(".trip-btn")).toBeNull());
  });

  test("search finds a plan of the current trip and opens it", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [activity(t, { name: "Taronga Zoo", tags: ["animals"] })];
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.type(screen.getByPlaceholderText("Search plans, expenses, trips"), "zoo");
    await user.click(await screen.findByRole("option", { name: /Taronga Zoo/ }));
    expect(await screen.findByRole("heading", { name: "Taronga Zoo" })).toBeInTheDocument();
  });

  test("an invitation appears under the bell and joining opens that trip", async () => {
    const mine = seedTrip(server.db);
    const theirs = trip({ name: "Tom's Bali", role: "MEMBER" });
    server.db.invitations = [member(theirs, { userId: 1, username: "Mia" }, { inviteStatus: "PENDING" })];
    server.on("post", "/trips/invitations/:id/respond", () => { server.db.invitations = []; server.db.trips.push(theirs); server.db.members[theirs.tripId] = []; return null; });
    const { user } = await renderApp(`/trip/${mine.tripId}/overview`);
    expect(document.querySelector(".bell .dot")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Tom's Bali")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(window.location.pathname).toBe(`/trip/${theirs.tripId}/overview`));
  });

  test("moving to another page fetches the trip again, so changes made elsewhere appear", async () => {
    const t = seedTrip(server.db);
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await new Promise((r) => setTimeout(r, 2100)); // past the short "just fetched" window
    server.db.activities[t.tripId] = [activity(t, { name: "Added by Tom" })];
    await user.click(screen.getByRole("button", { name: /^Vote/ }));
    expect(await screen.findByRole("heading", { name: "Added by Tom" })).toBeInTheDocument();
  });

  test("with no trips the trip pages are disabled and Home goes to the trip list", async () => {
    await renderApp("/");
    await waitFor(() => expect(window.location.pathname).toBe("/trips"));
    expect(screen.getByRole("button", { name: /^Vote/ })).toBeDisabled();
    expect(await screen.findByText("No trips here")).toBeInTheDocument();
  });
});

describe("Trip switcher keeps the page", () => {
  test("switching trips on Vote opens the other trip's Vote", async () => {
    const a = seedTrip(server.db, { name: "First trip", startDate: day(5), endDate: day(8) });
    const b = seedTrip(server.db, { name: "Second trip", startDate: day(20), endDate: day(25) });
    const { user } = await renderApp(`/trip/${a.tripId}/vote`);
    await user.click(screen.getByRole("button", { name: /First trip/ }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitemradio", { name: /Second trip/ }));
    await waitFor(() => expect(window.location.pathname).toBe(`/trip/${b.tripId}/vote`));
  });
});

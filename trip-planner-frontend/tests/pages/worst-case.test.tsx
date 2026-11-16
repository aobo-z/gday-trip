/* Regression tests for breaks found with worst-case data (break-ui). jsdom has no layout, so these pin the
   markup the CSS fixes rely on: full values in titles, clamping classes, length-aware figures. */
import { describe, expect, test } from "vitest";
import { renderApp, screen, waitFor } from "../render";
import { server } from "../server";
import { activity, day, scheduled, seedTrip } from "../fixtures";

const LONG_TRIP = "Aleksandra’s 40th birthday long weekend with the whole extended family and friends from uni";
const WELSH = "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch, Wales";
const LONG_IDEA = "Sunrise hot-air balloon flight over the Hunter Valley vineyards with champagne breakfast, transfers from the CBD and a souvenir photo package included";

describe("Worst-case data", () => {
  test("an unbreakable destination is clamped in the hero and readable in full on hover", async () => {
    const t = seedTrip(server.db, { name: LONG_TRIP, destination: WELSH });
    await renderApp(`/trip/${t.tripId}/overview`);
    const title = document.querySelector(".hero-title")!;
    expect(title).toHaveAttribute("title", WELSH);
    expect(title.closest(".hero-head")).not.toBeNull();
  });

  test("a long username is truncated in the top bar with the full name on hover", async () => {
    seedTrip(server.db);
    server.db.me.username = "Aleksandra Wiśniewska-Kowalczyk";
    await renderApp("/trips");
    const btn = document.querySelector(".me-btn")!;
    expect(btn).toHaveAttribute("title", "Aleksandra Wiśniewska-Kowalczyk");
    expect(btn.querySelector(".me-name")).toHaveTextContent("Aleksandra Wiśniewska-Kowalczyk");
  });

  test("long idea titles are clamped on cards and timeline events, with the full name on hover", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [activity(t, { name: LONG_IDEA }), scheduled(t, day(0), "06:00", "23:00", { name: LONG_IDEA + " (day)" })];
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    const h = screen.getByRole("heading", { name: LONG_IDEA });
    expect(h).toHaveClass("clamp2");
    expect(h).toHaveAttribute("title", LONG_IDEA);
    await user.click(document.querySelector<HTMLElement>("nav.nav button:nth-of-type(3)") ?? screen.getAllByRole("button", { name: /^Schedule/ })[0]);
    await waitFor(() => expect(document.querySelector("[data-ev]")).not.toBeNull());
    expect(document.querySelector("[data-ev]")).toHaveAttribute("title", `${LONG_IDEA} (day) · 06:00–23:00`);
  });

  test("votes past the threshold show a tick and the count, not '4/3'", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [activity(t, { name: "Popular", approveCount: 4, requiredApprovals: 3, status: "APPROVED" }), activity(t, { name: "Pending", approveCount: 1, requiredApprovals: 3 })];
    await renderApp(`/trip/${t.tripId}/vote`);
    const tallies = [...document.querySelectorAll(".tally")].map((x) => [x.textContent, x.classList.contains("met")]);
    expect(tallies).toHaveLength(2);
    expect(tallies).toEqual(expect.arrayContaining([["4", true], ["1/3", false]]));
  });

  test("a one-day trip says '1 day'", async () => {
    const t = seedTrip(server.db, { startDate: day(3), endDate: day(3) });
    await renderApp(`/trip/${t.tripId}/overview`);
    expect(document.querySelector(".stat-value small")).toHaveTextContent(/^day$/);
  });
});

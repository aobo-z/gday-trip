import { describe, expect, test } from "vitest";
import { within } from "@testing-library/react";
import { renderApp, screen, waitFor, dialog } from "../render";
import { server } from "../server";
import { day, seedTrip } from "../fixtures";

describe("Trips and New trip", () => {
  test("Upcoming (the default) counts down to each trip, soonest first; Past is most recent first; no All filter", async () => {
    seedTrip(server.db, { name: "Seoul spring", startDate: day(120), endDate: day(125) });
    seedTrip(server.db, { name: "Kyoto autumn", startDate: day(20), endDate: day(25) });
    seedTrip(server.db, { name: "Under way", startDate: day(-1), endDate: day(2), status: "ONGOING" });
    seedTrip(server.db, { name: "Hobart winter", startDate: day(-40), endDate: day(-35), status: "ARCHIVED" });
    seedTrip(server.db, { name: "Bali last year", startDate: day(-300), endDate: day(-290), status: "PUBLISHED" });
    const { user } = await renderApp("/trips");
    const titles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(screen.queryByRole("button", { name: /^All\s*\d/ })).toBeNull();
    expect(titles()).toEqual(["Under way", "Kyoto autumn", "Seoul spring"]);
    expect([...document.querySelectorAll(".tcard .chips .chip:first-child")].map((c) => c.textContent)).toEqual(["Day 2", "In 20 days", "In 120 days"]);
    await user.click(screen.getByRole("button", { name: /^Past/ }));
    expect(titles()).toEqual(["Hobart winter", "Bali last year"]);
  });

  test("New trip checks the dates and budget, then opens the new trip", async () => {
    seedTrip(server.db);
    const { user } = await renderApp("/trips");
    await user.click(screen.getAllByRole("button", { name: "New trip" })[0]);
    const d = dialog()!;
    await user.type(within(d).getByLabelText("Trip name"), "Autumn in Kyoto");
    await user.type(within(d).getByLabelText("Destination"), "Kyoto, Japan");
    await user.click(within(d).getByRole("button", { name: "Create trip" }));
    expect(within(d).getByText("Planned budget is required")).toBeInTheDocument();
    await user.type(within(d).getByLabelText("Budget"), "2500");
    await user.click(within(d).getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/trip\/\d+\/overview$/));
    expect(server.db.trips.at(-1)).toMatchObject({ name: "Autumn in Kyoto", plannedBudget: 2500 });
  });

  test("worst case: one-day trip and a long name don't produce '1 days' or overflow the switcher", async () => {
    const t = seedTrip(server.db, { name: "Aleksandra Wiśniewska-Kowalczyk’s 40th birthday long weekend", startDate: day(3), endDate: day(3) });
    await renderApp(`/trip/${t.tripId}/overview`);
    expect(document.querySelector(".stat-value small")!.textContent).toBe("day");
    expect(document.querySelector(".trip-btn-text b")).toHaveTextContent(t.name);
  });
});

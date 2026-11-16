import { describe, expect, test } from "vitest";
import { renderApp, screen, waitFor } from "../render";
import { server } from "../server";
import { day, seedTrip } from "../fixtures";

const DRAFT = {
  tripName: "Autumn Flavours of Kyoto", destination: "Kyoto, Japan", startDate: day(30), endDate: day(31), baseCurrency: "AUD", plannedBudget: 2500,
  summary: "Temples and food.", budgetBreakdown: [{ category: "Food", amount: 750 }], days: [{ date: day(30), theme: "Temples" }, { date: day(31), theme: null }],
  activities: [{ date: day(30), startTime: "09:00:00", endTime: "11:00:00", name: "Kinkaku-ji", location: "Kyoto", category: "Culture", estimatedCost: 10, description: null }],
};

describe("AI planner", () => {
  test("asks for a destination before calling the AI", async () => {
    seedTrip(server.db);
    const { user } = await renderApp("/ai");
    await user.click(screen.getByRole("button", { name: /Plan my trip/ }));
    expect(screen.getByText("Where to?")).toBeInTheDocument();
    expect(server.sent("post", "/ai-planner/draft")).toHaveLength(0);
  });

  test("draft → one landmark photo per landmark as covers → create shows progress and opens the trip", async () => {
    seedTrip(server.db);
    server.on("post", "/ai-planner/draft", () => DRAFT);
    server.on("get", "/ai-planner/covers", () => [{ landmark: "Kinkaku-ji", photo: "places/k/photos/1" }, { landmark: "Fushimi Inari Taisha", photo: "places/f/photos/1" }]);
    server.on("get", "/ai-planner/covers/photo", () => new Blob(["x"], { type: "image/jpeg" }));
    let release: (v: unknown) => void = () => {};
    server.on("post", "/ai-planner/trips", () => new Promise((r) => { release = r; }).then(() => { const t = { ...server.db.trips[0], tripId: 777, name: DRAFT.tripName }; server.db.trips.push(t); server.db.members[777] = []; return t; }));
    server.on("post", "/trips/:id/cover", () => server.db.trips.find((t) => t.tripId === 777));
    const { user } = await renderApp("/ai");
    await user.type(screen.getByPlaceholderText("Kyoto, Japan"), "Kyoto, Japan");
    await user.click(screen.getByRole("button", { name: /Plan my trip/ }));
    expect(await screen.findByRole("heading", { name: "Your plan" })).toBeInTheDocument();
    await waitFor(() => expect([...document.querySelectorAll("button.ai-cover-thumb")].map((b) => b.getAttribute("aria-label"))).toEqual(["Kinkaku-ji", "Fushimi Inari Taisha", "Built-in picture"]));
    expect(document.querySelector(".ai-cover-label")).toHaveTextContent("Kinkaku-ji");
    await user.click(screen.getByRole("button", { name: /Create trip · 1 place$/ }));
    expect(await screen.findByText("Creating the trip")).toBeInTheDocument();
    release(null);
    await waitFor(() => expect(window.location.pathname).toBe("/trip/777/overview"));
  });
});

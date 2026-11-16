import { describe, expect, test } from "vitest";
import { renderApp, screen, waitFor } from "../render";
import { server } from "../server";
import { activity, day, scheduled, seedTrip } from "../fixtures";

describe("Map", () => {
  test("pinned places are one list: numbered stops first, unscheduled ideas after", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [activity(t, { name: "Idea pinned" }), scheduled(t, day(0), "09:00", "10:00", { name: "Stop one" })];
    await renderApp(`/trip/${t.tripId}/map`);
    const rows = [...document.querySelectorAll(".map-row")].map((r) => r.querySelector(".map-name")!.textContent);
    expect(rows).toEqual(["Stop one", "Idea pinned"]);
    expect(document.querySelector(".map-row .map-num")!.textContent).toBe("1");
    expect(screen.getByText("Not scheduled")).toBeInTheDocument();
    expect(screen.queryByText("No pinned stops")).toBeNull();
  });

  test("places without coordinates go to the No pin card with a Place button", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [activity(t, { name: "Somewhere vague", latitude: null, longitude: null })];
    await renderApp(`/trip/${t.tripId}/map`);
    expect(screen.getByText("No places on the map yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Place/ })).toBeInTheDocument();
  });

  test("an admin's map switch reaches users without a reload", async () => {
    const t = seedTrip(server.db);
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await new Promise((r) => setTimeout(r, 2100));
    server.db.services.mapProvider = "OFF";
    await user.click(screen.getByRole("button", { name: /^Map/ }));
    await waitFor(() => expect(screen.getByText("Maps are off")).toBeInTheDocument());
  });
});

describe("Map pin popup", () => {
  test("shows the place (name, address, time) with no buttons", async () => {
    const { infoContent } = await import("../../src/parts/map/tripMapShared");
    const t = seedTrip(server.db);
    const el = infoContent(scheduled(t, day(0), "09:00", "10:00", { name: "Coastal walk", location: "Bondi Beach" }));
    expect(el.textContent).toContain("Coastal walk");
    expect(el.textContent).toContain("Bondi Beach");
    expect(el.textContent).toContain("09:00–10:00");
    expect(el.querySelectorAll("button")).toHaveLength(0);
  });

  test("with an open handler, the popup's Open button opens that activity", async () => {
    const { infoContent } = await import("../../src/parts/map/tripMapShared");
    const t = seedTrip(server.db);
    const a = scheduled(t, day(0), "09:00", "10:00", { name: "Coastal walk" });
    const opened: number[] = [];
    const el = infoContent(a, (id) => opened.push(id));
    (el.querySelector("button") as HTMLButtonElement).click();
    expect(el.querySelector("button")!.textContent).toBe("Open");
    expect(opened).toEqual([a.id]);
  });
});

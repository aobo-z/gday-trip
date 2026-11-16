import { describe, expect, test } from "vitest";
import { within } from "@testing-library/react";
import { renderApp, screen, waitFor, dialog } from "../render";
import { server } from "../server";
import { activity, seedTrip } from "../fixtures";

async function openAdd(button: RegExp | string = "Add activity") {
  const t = seedTrip(server.db);
  const r = await renderApp(`/trip/${t.tripId}/vote`);
  await r.user.click(screen.getAllByRole("button", { name: button })[0]);
  return { t, ...r };
}

describe("Add activity and Discover", () => {
  test("Discover: search, open a place (map + AI note), then Use this place adds it straight to the activities", async () => {
    server.db.places = [{ placeId: "p1", name: "Taronga Zoo Sydney", address: "Bradleys Head Rd, Mosman NSW 2088", latitude: -33.84, longitude: 151.24, primaryType: "zoo" }];
    const { t, user } = await openAdd(/Discover/);
    const d = dialog()!;
    await user.type(within(d).getByPlaceholderText(/Search near/), "zoo");
    await user.click(within(d).getByRole("button", { name: "Search" }));
    await user.click(await within(d).findByRole("listitem"));
    expect(within(d).getByTitle("Map of Taronga Zoo Sydney")).toHaveAttribute("src", expect.stringContaining("openstreetmap"));
    expect(await within(d).findByText(/is a highlight of the trip/)).toBeInTheDocument();
    await user.click(within(d).getByRole("button", { name: /Use this place/ }));
    await waitFor(() => expect(server.db.activities[t.tripId].map((a) => a.name)).toEqual(["Taronga Zoo Sydney"]));
    expect(await within(d).findByText("Added")).toBeInTheDocument();
    expect(within(d).getByRole("listitem")).toBeDisabled();
  });

  test("Discover: places already added can't be opened again", async () => {
    server.db.places = [{ placeId: "p1", name: "Sydney Opera House", address: "Bennelong Point", latitude: 0, longitude: 0, primaryType: "tourist_attraction" }];
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [activity(t, { name: "Sydney Opera House" })];
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    await user.click(screen.getByRole("button", { name: /Discover/ }));
    const d = dialog()!;
    await user.type(within(d).getByPlaceholderText(/Search near/), "opera");
    await user.click(within(d).getByRole("button", { name: "Search" }));
    expect(await within(d).findByRole("listitem")).toBeDisabled();
  });

  test("manual: tags can be typed, removed with ×, and a half-typed tag is saved on submit", async () => {
    const { t, user } = await openAdd();
    const d = dialog()!;
    await user.type(within(d).getByLabelText("Name"), "Night noodle market");
    await user.click(within(d).getByRole("radio", { name: /Food/ }));
    await user.type(within(d).getByPlaceholderText("Address or area"), "Hyde Park");
    const tag = within(d).getByLabelText("Add tag");
    await user.type(tag, "late{Enter}cheap{Enter}");
    await user.click(within(d).getByRole("button", { name: "Remove cheap" }));
    await user.type(tag, "outdoor");
    await user.click(within(d).getByRole("button", { name: "Propose" }));
    await waitFor(() => expect(server.db.activities[t.tripId][0]).toMatchObject({ name: "Night noodle market", category: "Food", tags: ["late", "outdoor"] }));
  });

  test("manual: required fields are checked before saving", async () => {
    const { user } = await openAdd();
    const d = dialog()!;
    await user.click(within(d).getByRole("button", { name: "Propose" }));
    expect(within(d).getByText("Activity name is required")).toBeInTheDocument();
    await user.type(within(d).getByLabelText("Name"), "Ferry");
    await user.click(within(d).getByRole("button", { name: "Propose" }));
    expect(within(d).getByText("Location is required")).toBeInTheDocument();
    expect(server.sent("post", /\/activities$/)).toHaveLength(0);
  });
});

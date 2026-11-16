import { describe, expect, test } from "vitest";
import { within } from "@testing-library/react";
import { renderApp, screen, waitFor } from "../render";
import { server } from "../server";
import { seedTrip } from "../fixtures";

describe("Settings", () => {
  test("account: username can't be blank, password must match and be long enough", async () => {
    seedTrip(server.db);
    server.on("put", "/users/me/password", () => null);
    const { user } = await renderApp("/settings");
    const edit = (row: number) => user.click(screen.getAllByRole("button", { name: /^(Edit|Cancel)$/ })[row]);
    expect(screen.queryByLabelText("Username")).toBeNull();
    await edit(0);
    const name = screen.getByLabelText("Username");
    await user.clear(name);
    await user.click(within(name.closest("form")!).getByRole("button", { name: "Save" }));
    expect(screen.getByText("Username is required")).toBeInTheDocument();
    await edit(2);
    expect(screen.queryByLabelText("Username")).toBeNull();
    await user.type(screen.getByLabelText("Current"), "old-password");
    await user.type(screen.getByLabelText("New"), "short");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByText("Password must be between 8 and 72 characters")).toBeInTheDocument();
  });

  test("admin: switching a service off saves and reaches the app's service status", async () => {
    seedTrip(server.db);
    server.db.me.role = "ADMIN";
    const { user } = await renderApp("/settings");
    await user.click(screen.getByRole("button", { name: /Admin/ }));
    const ai = await screen.findByRole("checkbox", { name: "AI" });
    expect(ai).toBeChecked();
    await user.click(ai);
    await waitFor(() => expect(server.db.services.aiRecommendations).toBe(false));
    await waitFor(() => expect(server.sent("get", "/services/status").length).toBeGreaterThan(1));
    await user.click(screen.getByRole("button", { name: /^AI planner/ }));
    expect(await screen.findByText("AI is off")).toBeInTheDocument();
  });

  test("the Admin tab is only there for admins", async () => {
    seedTrip(server.db);
    await renderApp("/settings");
    expect(screen.queryByRole("button", { name: /Admin/ })).toBeNull();
  });
});

describe("Join by link", () => {
  test("previews the trip and joins it", async () => {
    const t = seedTrip(server.db);
    server.on("get", "/trips/join/:code", () => ({ tripId: 900, name: "Tom's Bali", destination: "Bali", startDate: t.startDate, endDate: t.endDate, status: "PLANNING", memberCount: 3, alreadyMember: false }));
    server.on("post", "/trips/join/:code", () => { server.db.trips.push({ ...t, tripId: 900, name: "Tom's Bali", role: "MEMBER" }); server.db.members[900] = []; return {}; });
    const { user } = await renderApp("/join/ABC123");
    expect(await screen.findByText("Tom's Bali")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Join trip" }));
    await waitFor(() => expect(window.location.pathname).toBe("/trip/900/overview"));
  });

  test("an invalid code says so and offers the trip list", async () => {
    seedTrip(server.db);
    await renderApp("/join/NOPE");
    expect(await screen.findByRole("button", { name: "My trips" })).toBeInTheDocument();
  });
});

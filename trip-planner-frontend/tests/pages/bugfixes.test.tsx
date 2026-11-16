/* Regression tests for bugs found in the full frontend scan. */
import { describe, expect, test } from "vitest";
import { renderApp, screen, waitFor } from "../render";
import { reply, server } from "../server";
import { communityTrip, day, seedTrip, TOM } from "../fixtures";

describe("Bugs found in the frontend scan", () => {
  test("the Reviews badge counts again right after a review is sent", async () => {
    const t = seedTrip(server.db, { status: "ARCHIVED", startDate: day(-40), endDate: day(-35) });
    server.db.reviewable[t.tripId] = [{ userId: TOM.userId, username: TOM.username, alreadyReviewed: false }];
    const { user } = await renderApp("/reviews");
    const badge = () => screen.getByRole("button", { name: /^Reviews/ }).querySelector(".badge")?.textContent ?? "";
    await waitFor(() => expect(badge()).toBe("1"));
    await user.click(await screen.findByRole("button", { name: "5 stars" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(badge()).toBe(""));
  });

  test("Community shows more than the first 20 shared trips on request", async () => {
    seedTrip(server.db);
    const all = Array.from({ length: 23 }, (_, i) => communityTrip({ name: "Shared " + (i + 1), likeCount: 0 }));
    server.on("get", "/community/trips", (q) => { const p = Number((q.query as { page?: number }).page ?? 0); return all.slice(p * 20, p * 20 + 20); });
    const { user } = await renderApp("/community");
    await screen.findByText("Shared 1");
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(20);
    await user.click(screen.getByRole("button", { name: /Show more/ }));
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(23));
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
  });

  test("a network error at start-up keeps the saved sign-in", async () => {
    seedTrip(server.db);
    server.on("get", "/users/me", () => reply(503, { message: "Restarting" }));
    await renderApp("/", { signedIn: true });
    expect(localStorage.getItem("token")).toBe("test-token");
  });

  test("a rejected token is dropped at start-up", async () => {
    server.on("get", "/users/me", () => reply(403, { message: "Forbidden" }));
    await renderApp("/", { signedIn: true });
    expect(localStorage.getItem("token")).toBeNull();
  });

  test("a trip that failed to open recovers when Retry succeeds", async () => {
    const t = seedTrip(server.db);
    let fail = true;
    server.on("get", "/trips/:id/activities", () => (fail ? reply(500, { message: "Down for a moment" }) : []));
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    expect(await screen.findByText("Down for a moment")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Sydney", { selector: ".hero-title" })).toBeInTheDocument();
  });
});

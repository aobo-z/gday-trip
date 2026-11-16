/* A failed request shows what happened and a Retry, never an empty state that pretends there is nothing. */
import { describe, expect, test } from "vitest";
import { within } from "@testing-library/react";
import { renderApp, screen, waitFor, drawer } from "../render";
import { reply, server } from "../server";
import { activity, expense, seedTrip } from "../fixtures";

describe("Failed requests", () => {
  test("Overview: expenses that fail to load say so, and Retry loads them", async () => {
    const t = seedTrip(server.db);
    server.db.expenses[t.tripId] = [expense(t)];
    let fail = true;
    server.on("get", "/trips/:id/expenses", () => (fail ? reply(500, { message: "Service unavailable" }) : server.db.expenses[t.tripId]));
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    expect(await screen.findByText("Service unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No expenses yet")).toBeNull();
    fail = false;
    await user.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    await waitFor(() => expect(screen.queryByText("Service unavailable")).toBeNull());
  });

  test("Overview: a failed change feed isn't shown as 'Nothing yet'", async () => {
    const t = seedTrip(server.db);
    server.on("get", "/trips/:id/updates/key", () => reply(500));
    await renderApp(`/trip/${t.tripId}/overview`);
    expect(screen.getByText("Couldn't load the history.")).toBeInTheDocument();
    expect(screen.queryByText("Nothing yet")).toBeNull();
  });

  test("Reviews: a failed check isn't shown as 'Everyone's reviewed'", async () => {
    seedTrip(server.db, { status: "ARCHIVED" });
    server.on("get", "/trips/:id/reviews/reviewable-members", () => reply(500, { message: "Reviews are unavailable" }));
    await renderApp("/reviews");
    expect(await screen.findByText("Reviews are unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Everyone's reviewed")).toBeNull();
  });

  test("Notifications: a failed invitations check isn't shown as 'All caught up'", async () => {
    seedTrip(server.db);
    server.on("get", "/trips/invitations", () => reply(500));
    const { user } = await renderApp("/trips");
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Couldn't check for invitations.")).toBeInTheDocument();
    expect(screen.queryByText("All caught up")).toBeNull();
  });

  test("Idea drawer: comments that fail to load can be retried", async () => {
    const t = seedTrip(server.db);
    const a = activity(t, { name: "Opera House" });
    server.db.activities[t.tripId] = [a];
    let fail = true;
    server.on("get", "/activities/:id/comments", () => (fail ? reply(500, { message: "Comments are unavailable" }) : [{ id: 1, authorId: 2, authorUsername: "Tom", content: "Book ahead", createdAt: "2026-01-01T00:00:00" }]));
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    await user.click(screen.getByRole("button", { name: "Opera House" }));
    const d = drawer()!;
    expect(await within(d).findByText("Comments are unavailable")).toBeInTheDocument();
    fail = false;
    await user.click(within(d).getByRole("button", { name: "Retry" }));
    expect(await within(d).findByText("Book ahead")).toBeInTheDocument();
  });
});

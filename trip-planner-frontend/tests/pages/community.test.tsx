import { describe, expect, test } from "vitest";
import { fireEvent, within } from "@testing-library/react";
import { renderApp, screen, waitFor, dialog, drawer } from "../render";
import { server } from "../server";
import { communityTrip, seedTrip } from "../fixtures";

describe("Community", () => {
  test("search filters shared trips, and the sort toggles between popular and newest", async () => {
    seedTrip(server.db);
    server.db.community = [communityTrip({ name: "Tom's Osaka", likeCount: 1 }), communityTrip({ name: "Lena's Seoul", destination: "Seoul, South Korea", likeCount: 9 })];
    const { user } = await renderApp("/community");
    await screen.findByText("Tom's Osaka");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Lena's Seoul", "Tom's Osaka"]);
    await user.click(screen.getByRole("button", { name: "Newest" }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Tom's Osaka", "Lena's Seoul"]);
    await user.type(screen.getByPlaceholderText("City or trip"), "seoul");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Lena's Seoul"]);
  });

  test("a place opens its details (address as plain text), and copying it shows up in Vote at once", async () => {
    const t = seedTrip(server.db);
    server.db.community = [communityTrip()];
    const { user } = await renderApp("/community");
    await user.click(await screen.findByRole("button", { name: "Tom's Osaka" }));
    await user.click(drawer()!.querySelector<HTMLElement>(".click-row")!);
    const d = dialog()!;
    expect(within(d).getByText("1-1 Osakajo, Chuo Ward, Osaka").closest("a")).toBeNull();
    await user.click(within(d).getByRole("button", { name: /Copy to my trip/ }));
    await user.click(within(dialog()!).getByRole("button", { name: /Copy as activity/ }));
    await waitFor(() => expect(server.sent("post", /\/community\/places\/\d+\/copy/)).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: /^Vote/ }));
    expect(await screen.findByRole("heading", { name: "Osaka Castle" })).toBeInTheDocument();
    expect(server.db.activities[t.tripId]).toHaveLength(1);
  });

  test("anyone can leave a public comment on a shared trip and delete their own", async () => {
    seedTrip(server.db);
    const c = communityTrip();
    server.db.community = [c];
    server.db.communityComments[c.tripId] = [{ id: 900, content: "Great route", authorId: 2, authorName: "Tom", createdAt: "2026-01-01T00:00:00", canDelete: false }];
    const { user } = await renderApp("/community");
    await user.click(await screen.findByRole("button", { name: "Tom's Osaka" }));
    const d = drawer()!;
    expect(await within(d).findByText("Great route")).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: "Delete comment" })).toBeNull();
    await user.type(within(d).getByLabelText("Add a public comment"), "Saving this");
    await user.click(within(d).getByRole("button", { name: "Post comment" }));
    await waitFor(() => expect(server.sent("post", `/community/trips/${c.tripId}/comments`)[0]?.body).toMatchObject({ content: "Saving this" }));
    await user.click(await within(d).findByRole("button", { name: "Delete comment" }));
    await waitFor(() => expect(within(d).queryByText("Saving this")).toBeNull());
  });

  test("worst case: one place reads '1 place', and cards carry no day count", async () => {
    seedTrip(server.db);
    server.db.community = [communityTrip({ endDate: communityTrip().startDate })];
    await renderApp("/community");
    expect(await screen.findByText(/1 place ·/)).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ days?$/)).toBeNull();
  });

  test("nothing shared yet shows an empty state", async () => {
    seedTrip(server.db);
    await renderApp("/community");
    expect(await screen.findByText("Nothing shared yet")).toBeInTheDocument();
  });

  test("the owner can only take a published trip back from Community, not edit or delete it there", async () => {
    const t = seedTrip(server.db, { status: "PUBLISHED", name: "Published Osaka" });
    server.db.community = [communityTrip({ tripId: t.tripId, name: t.name })];
    const { user } = await renderApp("/community");
    await user.click(await screen.findByRole("button", { name: "Published Osaka" }));
    const d = drawer()!;
    expect(within(d).queryByRole("button", { name: "Edit trip" })).toBeNull();
    expect(within(d).getByRole("button", { name: "Remove from Community" })).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: "Delete trip" })).toBeNull();
    await user.click(within(d).getByRole("button", { name: "Remove from Community" }));
    fireEvent.keyDown(within(dialog()!).getByRole("button", { name: /hold to remove/i }), { key: "Enter" });
    await waitFor(() => expect(server.sent("put", `/trips/${t.tripId}/unpublish`)).toHaveLength(1));
  });
});

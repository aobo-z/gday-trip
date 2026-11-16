import { describe, expect, test } from "vitest";
import { within } from "@testing-library/react";
import { renderApp, screen, waitFor, dialog } from "../render";
import { server } from "../server";
import { activity, day, scheduled, seedTrip, TOM } from "../fixtures";

describe("Overview", () => {
  test("shows the trip, its stage, the travellers and today's plans", async () => {
    const t = seedTrip(server.db, { name: "Sydney weekend" });
    server.db.activities[t.tripId] = [scheduled(t, day(0), "09:00", "11:00", { name: "Coastal walk" })];
    await renderApp(`/trip/${t.tripId}/overview`);
    expect(screen.getByText("Sydney", { selector: ".hero-title" })).toBeInTheDocument();
    const stage = screen.getByRole("list", { name: "Trip stage" });
    expect(stage.querySelector('[aria-current="step"]')?.textContent).toBe("Planning");
    expect(screen.getByText(TOM.username)).toBeInTheDocument();
    expect(await screen.findByText("Coastal walk")).toBeInTheDocument();
  });

  test("the ideas card counts each state and links to the ideas that need my vote", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [
      activity(t, { name: "A" }), activity(t, { name: "B", currentUserVote: "APPROVE" }),
      activity(t, { name: "C", status: "APPROVED" }), activity(t, { name: "D", status: "REJECTED" }),
      scheduled(t, day(0), "09:00", "10:00", { name: "E" }),
    ];
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    const key = Object.fromEntries([...document.querySelectorAll(".pipe-key span")].map((s) => [s.querySelector("small")!.textContent, s.querySelector("b")!.textContent]));
    expect(key).toEqual({ Scheduled: "1", "To schedule": "1", Voting: "2", Rejected: "1" });
    await user.click(screen.getByRole("button", { name: /1 need your vote/ }));
    await waitFor(() => expect(window.location.pathname).toBe(`/trip/${t.tripId}/vote`));
  });

  test("an owner starts the trip after confirming, and there's no button to delete the cover", async () => {
    const t = seedTrip(server.db, { coverImageId: "abc" });
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    expect(screen.queryByRole("button", { name: "Remove cover" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Start trip" }));
    await user.click(within(dialog()!).getByRole("button", { name: "Start trip" }));
    await waitFor(() => expect(server.sent("put", `/trips/${t.tripId}/start`)).toHaveLength(1));
    expect(await screen.findByText("On the road")).toBeInTheDocument();
  });

  test("members can't change the lifecycle or the cover", async () => {
    const t = seedTrip(server.db, { role: "MEMBER" });
    await renderApp(`/trip/${t.tripId}/overview`);
    expect(screen.queryByRole("button", { name: "Start trip" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Upload cover" })).toBeNull();
  });
});

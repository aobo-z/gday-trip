import { describe, expect, test } from "vitest";
import { within } from "@testing-library/react";
import { renderApp, screen } from "../render";
import { server } from "../server";
import { ME, seedTrip } from "../fixtures";

const card = () => screen.getByRole("dialog", { name: /./ }) as HTMLElement;

describe("Page tips", () => {
  test("the ? button walks through the page's areas, skipping ones that aren't on screen", async () => {
    const t = seedTrip(server.db);
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(screen.getByRole("button", { name: "Tips for this page" }));
    expect(within(card()).getByText("Your trip, page by page")).toBeInTheDocument();
    const total = within(card()).getByText(/^1 \/ \d+$/).textContent!.split(" / ")[1];
    expect(Number(total)).toBe(6);
    await user.click(within(card()).getByRole("button", { name: "Next" }));
    expect(within(card()).getByText("Switch trips")).toBeInTheDocument();
    await user.click(within(card()).getByRole("button", { name: "Back" }));
    expect(within(card()).getByText("Your trip, page by page")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Your trip, page by page")).toBeNull();
    expect(localStorage.getItem(`gday-tips:${ME.userId}:overview`)).toBe("1");
  });

  test("steps for areas that aren't there are left out (no activities yet means no card step)", async () => {
    const t = seedTrip(server.db);
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    await user.click(screen.getByRole("button", { name: "Tips for this page" }));
    expect(within(card()).getByText(/^1 \/ 4$/)).toBeInTheDocument();
    expect(within(card()).getByText("Discover places")).toBeInTheDocument();
    for (let i = 0; i < 3; i++) await user.click(within(card()).getByRole("button", { name: "Next" }));
    await user.click(within(card()).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  test("tips on an Explore page close with Skip (their key must not clash with the page's)", async () => {
    seedTrip(server.db);
    const { user } = await renderApp("/trips");
    await user.click(screen.getByRole("button", { name: "Tips for this page" }));
    await user.click(within(card()).getByRole("button", { name: "Next" }));
    await user.click(within(card()).getByRole("button", { name: "Back" }));
    await user.click(within(card()).getByRole("button", { name: "Skip" }));
    expect(document.querySelector(".tour")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Trips" })).toBeInTheDocument();
  });

  test("pages without tips have no ? button", async () => {
    seedTrip(server.db);
    await renderApp("/profile");
    expect(screen.queryByRole("button", { name: "Tips for this page" })).toBeNull();
  });
});

describe("Closing page tips", () => {
  test("tips closed with Skip before the automatic start don't pop back up", async () => {
    const { tipsConfig } = await import("../../src/lib/tours");
    const was = { ...tipsConfig };
    Object.assign(tipsConfig, { auto: true, delay: 400 });
    try {
      const t = seedTrip(server.db);
      const { user } = await renderApp(`/trip/${t.tripId}/overview`);
      await user.click(screen.getByRole("button", { name: "Tips for this page" }));
      await user.click(within(card()).getByRole("button", { name: "Skip" }));
      await new Promise((r) => setTimeout(r, 700));
      expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    } finally { Object.assign(tipsConfig, was); }
  });

  test("tips that opened by themselves close with Done and stay closed", async () => {
    const { tipsConfig } = await import("../../src/lib/tours");
    const was = { ...tipsConfig };
    Object.assign(tipsConfig, { auto: true, delay: 50 });
    try {
      const t = seedTrip(server.db);
      server.db.activities[t.tripId] = [];
      const { user } = await renderApp(`/trip/${t.tripId}/vote`);
      const done = async () => { for (;;) { const b = within(card()).queryByRole("button", { name: "Done" }); if (b) return b; await user.click(within(card()).getByRole("button", { name: "Next" })); } };
      await screen.findByRole("button", { name: "Skip" });
      await user.click(await done());
      await new Promise((r) => setTimeout(r, 300));
      expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
      expect(localStorage.getItem(`gday-tips:${ME.userId}:vote`)).toBe("1");
    } finally { Object.assign(tipsConfig, was); }
  });
});

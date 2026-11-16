import { describe, expect, test } from "vitest";
import { within } from "@testing-library/react";
import { renderApp, screen, waitFor, drawer } from "../render";
import { server } from "../server";
import { day, LENA, ME, review, seedTrip, TOM } from "../fixtures";

describe("Reviews", () => {
  test("rate a fellow traveller on an archived trip; they leave the to-do list", async () => {
    const t = seedTrip(server.db, { name: "Hobart winter", status: "ARCHIVED", startDate: day(-40), endDate: day(-35) });
    server.db.reviewable[t.tripId] = [{ userId: TOM.userId, username: TOM.username, alreadyReviewed: false }];
    const { user } = await renderApp("/reviews");
    const submit = await screen.findByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "4 stars" }));
    await user.click(submit);
    await waitFor(() => expect(screen.getByText("Everyone's reviewed")).toBeInTheDocument());
  });

  test("Written groups my reviews by trip, and faces open profiles", async () => {
    seedTrip(server.db);
    server.db.written = [review(ME, TOM, { tripName: "Hobart winter" }), review(ME, LENA, { tripName: "Hobart winter", rating: 4 }), review(ME, TOM, { tripId: 10, tripName: "Bali", comment: null })];
    const { user } = await renderApp("/reviews");
    await user.click(screen.getByRole("button", { name: /Written/ }));
    const groups = document.querySelectorAll("details.rv-group");
    expect([...groups].map((g) => g.querySelector("h3")!.textContent)).toEqual(["Hobart winter", "Bali"]);
    expect(groups[0]).toHaveAttribute("open");
    await user.click(within(groups[0] as HTMLElement).getByRole("button", { name: `${LENA.username} profile` }));
    expect(await within(drawer()!).findByRole("heading", { name: LENA.username })).toBeInTheDocument();
  });
});

describe("Profile", () => {
  test("shows rating with stars, review count, trips and only the latest few reviews until expanded", async () => {
    seedTrip(server.db);
    server.db.reviewsAbout[ME.userId] = Array.from({ length: 6 }, (_, i) => review({ userId: 10 + i, username: "Traveller " + i }, ME, { rating: i === 0 ? 4 : 5 }));
    const { user } = await renderApp("/profile");
    expect(await screen.findByText("4.8")).toBeInTheDocument();
    expect(screen.getByText(/since Feb 2025/)).toBeInTheDocument();
    expect(document.querySelectorAll(".rv-row")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Show all 6" }));
    expect(document.querySelectorAll(".rv-row")).toHaveLength(6);
    expect(document.querySelectorAll(".rating-label svg")).toHaveLength(5);
  });

  test("another traveller's profile shows empty stars when nobody has reviewed them", async () => {
    const t = seedTrip(server.db);
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(screen.getAllByRole("button", { name: `${TOM.username} profile` })[0]);
    const d = drawer()!;
    expect(await within(d).findByText("No reviews yet")).toBeInTheDocument();
    expect(d.querySelectorAll(".person-score .stars svg")).toHaveLength(5);
  });
});

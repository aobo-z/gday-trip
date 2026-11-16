import { describe, expect, test } from "vitest";
import { fireEvent, within } from "@testing-library/react";
import { renderApp, screen, waitFor, dialog, drawer, toastText } from "../render";
import { reply, server } from "../server";
import { activity, day, ME, scheduled, seedTrip } from "../fixtures";

const card = (name: string) => screen.getByRole("button", { name }).closest("article") as HTMLElement;
const titles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

describe("Vote: ideas board", () => {
  test("filters by state with counts, and searches name, place and tags", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [activity(t, { name: "Opera House" }), activity(t, { name: "Fish market", currentUserVote: "APPROVE", tags: ["seafood"] }),
      activity(t, { name: "Zoo", status: "REJECTED" })];
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    expect(titles()).toEqual(["Opera House", "Fish market", "Zoo"]);
    await user.click(screen.getByRole("button", { name: /Needs my vote/ }));
    expect(titles()).toEqual(["Opera House"]);
    await user.click(screen.getByRole("button", { name: /^All\s*\d/ }));
    await user.type(screen.getByPlaceholderText("Filter"), "seafood");
    expect(titles()).toEqual(["Fish market"]);
  });

  test("a vote shows at once, and goes back with a message when the server refuses it", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [activity(t, { name: "Opera House" })];
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    await user.click(within(card("Opera House")).getByRole("button", { name: "Approve" }));
    expect(within(card("Opera House")).getByRole("button", { name: "Approve" })).toHaveAttribute("aria-pressed", "true");
    server.on("put", "/activities/:id/vote", () => reply(409, { message: "Voting has closed" }));
    await user.click(within(card("Opera House")).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(toastText()).toContain("Voting has closed"));
    expect(within(card("Opera House")).getByRole("button", { name: "Reject" })).toHaveAttribute("aria-pressed", "false");
  });

  test("a branch has left voting: it reads To schedule or Scheduled, with no vote buttons", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [activity(t, { name: "Rainy day museum", branch: true, status: "BRANCH" }),
      scheduled(t, day(0), "10:00", "11:00", { name: "Night kayak", branch: true, status: "BRANCH" }), activity(t, { name: "Opera House" })];
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    expect(within(card("Rainy day museum")).getByText("To schedule")).toBeInTheDocument();
    expect(within(card("Night kayak")).getByText("Scheduled")).toBeInTheDocument();
    expect(within(card("Rainy day museum")).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Branches/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Scheduled/ }));
    expect(titles()).toEqual(["Night kayak"]);
  });

  test("tapping my vote again takes it back", async () => {
    const t = seedTrip(server.db);
    const a = activity(t, { name: "Opera House", currentUserVote: "APPROVE", approveCount: 1 });
    server.db.activities[t.tripId] = [a];
    server.on("delete", "/activities/:id/vote", () => ({ ...a, currentUserVote: null, approveCount: 0 }));
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    const approve = within(card("Opera House")).getByRole("button", { name: "Approve" });
    expect(approve).toHaveAttribute("aria-pressed", "true");
    await user.click(approve);
    await waitFor(() => expect(server.sent("delete", `/activities/${a.id}/vote`)).toHaveLength(1));
    expect(within(card("Opera House")).getByRole("button", { name: "Approve" })).toHaveAttribute("aria-pressed", "false");
    expect(server.sent("put", `/activities/${a.id}/vote`)).toHaveLength(0);
  });

  test("Discover opens the place search on its own; Add activity opens the form", async () => {
    const t = seedTrip(server.db);
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    await user.click(screen.getByRole("button", { name: /Discover/ }));
    expect(within(document.querySelector<HTMLElement>("dialog.dlg[open]")!).getByRole("searchbox")).toBeInTheDocument();
  });

  test("worst case: a very long address stays on one line with the full text on hover", async () => {
    const t = seedTrip(server.db);
    const long = "Shop 12, Level 3, The Galeries Victoria, 500 George Street, Sydney NSW 2000, Australia";
    server.db.activities[t.tripId] = [activity(t, { name: "Đặng Thị Ngọc Hân’s favourite café — open late", location: long })];
    await renderApp(`/trip/${t.tripId}/vote`);
    const meta = document.querySelector(".tcard .meta.one")!;
    expect(meta).toHaveAttribute("title", long);
    expect(meta.querySelector("span")!.textContent).toBe(long);
  });

  test("the idea drawer's Schedule button opens the Schedule at the most preferred time", async () => {
    const t = seedTrip(server.db);
    const a = activity(t, { name: "Evening market", status: "APPROVED", approveCount: 2 });
    server.db.activities[t.tripId] = [a];
    server.db.prefs[a.id] = { activityId: a.id, eligibleMemberCount: 2, respondingMemberCount: 2, currentUserPreferences: [],
      slots: [{ preferredDate: day(1), preferredStartTime: "18:00:00", preferredEndTime: "20:00:00", memberCount: 2 }] };
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    await user.click(screen.getByRole("button", { name: "Evening market" }));
    await user.click(await within(drawer()!).findByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(window.location.pathname).toBe(`/trip/${t.tripId}/schedule`));
    await waitFor(() => expect(document.querySelector(".days [aria-pressed=true]")).toHaveAttribute("data-v", day(1)));
  });

  test("the drawer saves my preferred time and posts a comment", async () => {
    const t = seedTrip(server.db);
    const a = activity(t, { name: "Opera House" });
    server.db.activities[t.tripId] = [a];
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    await user.click(screen.getByRole("button", { name: "Opera House" }));
    const d = drawer()!;
    await user.click(within(d).getByRole("button", { name: /^Add$/ }));
    const p = dialog()!;
    await user.click(within(p).getByRole("button", { name: "Afternoon" }));
    expect(within(p).getByText("13:00 – 17:00")).toBeInTheDocument();
    fireEvent.change(within(p).getByRole("slider", { name: "To" }), { target: { value: String(15 * 60 + 30) } });
    expect(within(p).getByText("13:00 – 15:30")).toBeInTheDocument();
    await user.click(within(p).getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(server.sent("put", `/activities/${a.id}/preferences/me`)[0]?.body).toMatchObject({ preferredStartTime: "13:00", preferredEndTime: "15:30" }));
    await waitFor(() => expect(within(d).getByText(/13:00–15:30/)).toBeInTheDocument());
    await user.type(within(d).getByPlaceholderText("Add a comment"), "Book ahead!");
    await user.click(within(d).getByRole("button", { name: "Post" }));
    expect(await within(d).findByText("Book ahead!")).toBeInTheDocument();
  });

  test("my own comment has a delete button that asks first; someone else's has none", async () => {
    const t = seedTrip(server.db, { role: "MEMBER" });
    const a = activity(t, { name: "Opera House" });
    server.db.activities[t.tripId] = [a];
    server.db.comments[a.id] = [{ id: 901, authorId: ME.userId, authorUsername: ME.username, content: "Mine", createdAt: "2026-01-01T00:00:00" },
      { id: 902, authorId: 2, authorUsername: "Tom", content: "Theirs", createdAt: "2026-01-01T00:00:00" }];
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    await user.click(screen.getByRole("button", { name: "Opera House" }));
    const d = drawer()!;
    await within(d).findByText("Theirs");
    expect(within(d).getAllByRole("button", { name: "Delete comment" })).toHaveLength(1);
    await user.click(within(d).getByRole("button", { name: "Delete comment" }));
    expect(dialog()!).toHaveTextContent("Delete this comment?");
    expect(server.sent("delete", `/activities/${a.id}/comments/901`)).toHaveLength(0);
  });

  test("preferred times stand in for the time until it is set; a scheduled or rejected idea shows none", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [scheduled(t, day(0), "09:00", "11:00", { name: "Coastal walk" }), activity(t, { name: "Night market", status: "REJECTED" }), activity(t, { name: "Ferry", status: "APPROVED" })];
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    const open = async (name: string) => {
      if (drawer()) { await user.click(within(drawer()!).getByRole("button", { name: "Close" })); await waitFor(() => expect(drawer()).toBeNull()); }
      await user.click(screen.getByRole("button", { name })); return drawer()!;
    };
    let d = await open("Coastal walk");
    expect(within(d).queryByText("Preferred times")).toBeNull();
    expect(within(d).getByText("When")).toBeInTheDocument();
    d = await open("Ferry");
    expect(within(d).getByText("Preferred times")).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: /^Add$/ })).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: /Schedule/ })).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: "Approve" })).toBeNull();
    d = await open("Night market");
    expect(within(d).queryByText("Preferred times")).toBeNull();
  });

  test("a scheduled idea links to its place on the calendar instead of showing vote buttons", async () => {
    const t = seedTrip(server.db);
    server.db.activities[t.tripId] = [scheduled(t, day(0), "09:00", "11:00", { name: "Coastal walk" })];
    const { user } = await renderApp(`/trip/${t.tripId}/vote`);
    expect(within(card("Coastal walk")).queryByRole("button", { name: "Approve" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Coastal walk" }));
    expect(within(drawer()!).getByText(/09:00–11:00/)).toBeInTheDocument();
    await user.click(within(drawer()!).getByRole("button", { name: "Open in the schedule" }));
    await waitFor(() => expect(window.location.pathname).toBe(`/trip/${t.tripId}/schedule`));
  });

  test("archived trips are read-only", async () => {
    const t = seedTrip(server.db, { status: "ARCHIVED" });
    server.db.activities[t.tripId] = [activity(t, { name: "Opera House" })];
    await renderApp(`/trip/${t.tripId}/vote`);
    expect(screen.queryByRole("button", { name: "Add idea" })).toBeNull();
    expect(screen.getByText(/read-only/)).toBeInTheDocument();
    expect(within(card("Opera House")).getByRole("button", { name: "Approve" })).toBeDisabled();
  });
});

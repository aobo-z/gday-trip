import { describe, expect, test } from "vitest";
import { fireEvent, within } from "@testing-library/react";
import { renderApp, screen, waitFor, dialog, drawer, toastText } from "../render";
import { server } from "../server";
import { announcement, day, member, scheduled, seedTrip, tripFile, TOM } from "../fixtures";

const card = (name: string) => screen.getByRole("region", { name });

describe("Announcements (FR-19)", () => {
  test("members see the latest announcements, newest first, with author and time", async () => {
    const t = seedTrip(server.db, { role: "MEMBER" });
    server.db.announcements[t.tripId] = [announcement(t, { title: "Flight moved", authorName: TOM.username, authorId: TOM.userId, canManage: false }),
      announcement(t, { title: "Passports", canManage: false })];
    await renderApp(`/trip/${t.tripId}/overview`);
    const box = card("Announcements");
    await waitFor(() => expect([...box.querySelectorAll(".ann-title")].map((x) => x.textContent)).toEqual(["Flight moved", "Passports"]));
    expect(within(box).getByText("Tom")).toBeInTheDocument();
    expect(within(box).queryByRole("button", { name: "New" })).toBeNull();
  });

  test("an owner posts one: it's sent trimmed and appears at the top", async () => {
    const t = seedTrip(server.db);
    server.db.announcements[t.tripId] = [announcement(t, { title: "Older news" })];
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(within(card("Announcements")).getByRole("button", { name: "New" }));
    const d = dialog()!;
    await user.type(within(d).getByPlaceholderText("Flight time changed"), "  Bring jackets ");
    await user.type(within(d).getByPlaceholderText("What does everyone need to know?"), "It will be 8 degrees in Kyoto.");
    await user.click(within(d).getByRole("button", { name: "Post" }));
    await waitFor(() => expect(server.sent("post", `/trips/${t.tripId}/announcements`)).toHaveLength(1));
    expect(server.sent("post", `/trips/${t.tripId}/announcements`)[0].body).toEqual({ title: "Bring jackets", content: "It will be 8 degrees in Kyoto." });
    await waitFor(() => expect(card("Announcements").querySelector(".ann-title")?.textContent).toBe("Bring jackets"));
    expect(toastText()).toContain("Announcement posted");
  });

  test("a blank announcement isn't sent", async () => {
    const t = seedTrip(server.db);
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(await within(card("Announcements")).findByRole("button", { name: "Post the first one" }));
    await user.type(within(dialog()!).getByPlaceholderText("Flight time changed"), "   ");
    await user.click(within(dialog()!).getByRole("button", { name: "Post" }));
    expect(within(dialog()!).getByText("Add a title")).toBeInTheDocument();
    expect(server.sent("post", /announcements/)).toHaveLength(0);
  });

  test("an owner edits one and then deletes it after holding to confirm", async () => {
    const t = seedTrip(server.db);
    const a = announcement(t, { title: "Meeting point" });
    server.db.announcements[t.tripId] = [a];
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(await within(card("Announcements")).findByRole("button", { name: /Meeting point/ }));
    await user.click(within(dialog()!).getByRole("button", { name: "Edit" }));
    const title = within(dialog()!).getByDisplayValue("Meeting point");
    await user.clear(title); await user.type(title, "New meeting point");
    await user.click(within(dialog()!).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(server.sent("put", `/trips/${t.tripId}/announcements/${a.announcementId}`)).toHaveLength(1));
    await waitFor(() => expect(within(card("Announcements")).getByText(/edited/)).toBeInTheDocument());

    await user.click(within(card("Announcements")).getByRole("button", { name: /New meeting point/ }));
    await user.click(within(dialog()!).getByRole("button", { name: "Delete" }));
    fireEvent.keyDown(within(dialog()!).getByRole("button", { name: /hold to delete/i }), { key: "Enter" });
    await waitFor(() => expect(server.sent("delete", `/trips/${t.tripId}/announcements/${a.announcementId}`)).toHaveLength(1));
    expect(await within(card("Announcements")).findByText("Share news the whole group needs to see")).toBeInTheDocument();
  });

  test("members can open an announcement but can't edit or delete it", async () => {
    const t = seedTrip(server.db, { role: "MEMBER" });
    server.db.announcements[t.tripId] = [announcement(t, { canManage: false })];
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(await within(card("Announcements")).findByRole("button", { name: /Meeting point/ }));
    expect(within(dialog()!).getByText("Terminal 1, desk H, at 6 am.")).toBeInTheDocument();
    expect(within(dialog()!).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(dialog()!).queryByRole("button", { name: "Delete" })).toBeNull();
  });
});

describe("Files (FR-18)", () => {
  test("the overview lists the trip's files with the activity each belongs to, and opens a preview", async () => {
    const t = seedTrip(server.db);
    server.db.files[t.tripId] = [tripFile(t, { fileName: "Ryokan booking.pdf", activityId: 1, activityName: "Ryokan check-in" }), tripFile(t)];
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    const box = card("Files");
    await waitFor(() => expect([...box.querySelectorAll(".file-name")].map((x) => x.textContent)).toEqual(["Ryokan booking.pdf", "Flight itinerary.pdf"]));
    expect([...box.querySelectorAll(".file-sub")].map((x) => x.textContent)).toEqual(["Ryokan check-in", "Whole trip"]);
    await user.click(within(box).getByRole("button", { name: /Flight itinerary.pdf/ }));
    const d = dialog()!;
    expect(within(d).getByRole("heading", { name: "Flight itinerary.pdf" })).toBeInTheDocument();
    await waitFor(() => expect(d.querySelector("iframe")).not.toBeNull());
    expect(server.sent("get", new RegExp(`/files/${server.db.files[t.tripId][1].fileId}/download$`))).toHaveLength(1);
    expect(within(d).getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  test("a member uploads to an activity; unsupported files are flagged and skipped", async () => {
    const t = seedTrip(server.db, { role: "MEMBER" });
    const hike = scheduled(t, day(0), "08:00", "11:00", { name: "Fushimi Inari hike" });
    server.db.activities[t.tripId] = [hike];
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(await within(card("Files")).findByRole("button", { name: "Upload" }));
    const d = dialog()!;
    const input = d.querySelector<HTMLInputElement>('input[type="file"]')!;
    // Straight onto the input, past the file picker's own type filter, so the dialog's check is what's tested.
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["%PDF-1.4"], "Trail map.pdf", { type: "application/pdf" }), new File(["x"], "notes.txt", { type: "text/plain" })] });
    fireEvent.change(input);
    expect(within(d).getByText("Only PDFs and JPEG, PNG or WebP images")).toBeInTheDocument();
    await user.selectOptions(within(d).getByRole("combobox"), String(hike.id));
    await user.click(within(d).getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(server.sent("post", `/trips/${t.tripId}/files`)).toHaveLength(1));
    const form = server.sent("post", `/trips/${t.tripId}/files`)[0].body as FormData;
    expect((form.get("file") as File).name).toBe("Trail map.pdf");
    expect(form.get("activityId")).toBe(String(hike.id));
    await waitFor(() => expect(card("Files").querySelector(".file-name")?.textContent).toBe("Trail map.pdf"));
    expect(toastText()).toContain("Uploaded Trail map.pdf");
  });

  test("files over 10 MB are refused before uploading", async () => {
    const t = seedTrip(server.db);
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(await within(card("Files")).findByRole("button", { name: "Upload" }));
    const big = new File(["x"], "Scan.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    await user.upload(dialog()!.querySelector<HTMLInputElement>('input[type="file"]')!, big);
    expect(within(dialog()!).getByText("Larger than 10 MB")).toBeInTheDocument();
    expect(within(dialog()!).getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  test("only files I may manage offer Delete, and deleting one removes it after confirming", async () => {
    const t = seedTrip(server.db, { role: "MEMBER" });
    const mine = tripFile(t, { fileName: "My ticket.pdf" }), theirs = tripFile(t, { fileName: "Tom's ticket.pdf", uploaderId: TOM.userId, uploaderName: TOM.username, canDelete: false });
    server.db.files[t.tripId] = [mine, theirs];
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(await within(card("Files")).findByRole("button", { name: /Tom's ticket.pdf/ }));
    expect(within(dialog()!).queryByRole("button", { name: "Delete" })).toBeNull();
    await user.click(within(dialog()!).getByRole("button", { name: "Close" }));
    await user.click(within(card("Files")).getByRole("button", { name: /My ticket.pdf/ }));
    await user.click(within(dialog()!).getByRole("button", { name: "Delete" }));
    fireEvent.keyDown(within(dialog()!).getByRole("button", { name: /hold to delete/i }), { key: "Enter" });
    await waitFor(() => expect(server.sent("delete", `/trips/${t.tripId}/files/${mine.fileId}`)).toHaveLength(1));
    await waitFor(() => expect([...card("Files").querySelectorAll(".file-name")].map((x) => x.textContent)).toEqual(["Tom's ticket.pdf"]));
  });

  test("the all-files view groups files by plan and searches them", async () => {
    const t = seedTrip(server.db);
    server.db.files[t.tripId] = [tripFile(t, { fileName: "A.pdf" }), tripFile(t, { fileName: "B.pdf", activityId: 7, activityName: "Ryokan check-in" }),
      tripFile(t, { fileName: "C.png", contentType: "image/png" }), tripFile(t, { fileName: "D.pdf" }), tripFile(t, { fileName: "E.pdf", activityId: 7, activityName: "Ryokan check-in" })];
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(await within(card("Files")).findByRole("button", { name: /See all/ }));
    const d = dialog()!;
    expect([...d.querySelectorAll(".file-groups h4")].map((h) => h.firstChild?.textContent)).toEqual(["Whole trip", "Ryokan check-in"]);
    await user.type(within(d).getByRole("searchbox", { name: "Search files" }), "ryokan");
    expect([...d.querySelectorAll(".file-row-main b")].map((b) => b.textContent)).toEqual(["B.pdf", "E.pdf"]);
    await user.click(within(d).getByRole("button", { name: /Whole trip/ }));
    expect(within(d).getByText("No files match")).toBeInTheDocument();
  });

  test("a plan's drawer lists only its files and attaches new ones to it", async () => {
    const t = seedTrip(server.db);
    const hike = scheduled(t, day(0), "08:00", "11:00", { name: "Fushimi Inari hike" });
    server.db.activities[t.tripId] = [hike];
    server.db.files[t.tripId] = [tripFile(t, { fileName: "Trail map.png", contentType: "image/png", activityId: hike.id, activityName: hike.name }), tripFile(t, { fileName: "Flights.pdf" })];
    const { user } = await renderApp(`/trip/${t.tripId}/schedule`);
    await user.click(screen.getByRole("button", { name: /Fushimi Inari hike/ }));
    await waitFor(() => expect(drawer()).not.toBeNull());
    const files = drawer()!.querySelector<HTMLElement>('.fact[aria-label="Files"]')!;
    await waitFor(() => expect([...files.querySelectorAll(".fact-item-txt b")].map((b) => b.textContent)).toEqual(["Trail map.png"]));
    await user.click(within(files).getByRole("button", { name: "Attach" }));
    expect(within(dialog()!).getByText(/Attaching to/)).toHaveTextContent("Attaching to Fushimi Inari hike");
  });

  test("an archived trip's files can be read but not changed", async () => {
    const t = seedTrip(server.db, { status: "ARCHIVED", startDate: day(-10), endDate: day(-5) });
    server.db.files[t.tripId] = [tripFile(t)];
    server.db.announcements[t.tripId] = [announcement(t)];
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await within(card("Files")).findByRole("button", { name: /Flight itinerary.pdf/ });
    expect(within(card("Files")).queryByRole("button", { name: "Upload" })).toBeNull();
    expect(within(card("Announcements")).queryByRole("button", { name: "New" })).toBeNull();
    await user.click(within(card("Files")).getByRole("button", { name: /Flight itinerary.pdf/ }));
    expect(within(dialog()!).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(dialog()!).getByRole("button", { name: "Download" })).toBeInTheDocument();
  });
});

describe("Trips, members and joining", () => {
  test("only currencies the backend supports are offered", async () => {
    seedTrip(server.db);
    const { user } = await renderApp("/trips");
    await user.click(screen.getAllByRole("button", { name: "New trip" })[0]);
    const options = [...within(dialog()!).getByRole("combobox").querySelectorAll("option")].map((x) => x.textContent);
    expect(options).toEqual(["AUD", "USD", "EUR", "GBP", "NZD", "JPY", "CNY", "SGD", "HKD", "CAD"]);
  });

  test("a finished trip's invite link explains it can't be joined", async () => {
    server.on("get", "/trips/join/:code", () => ({ tripId: 901, name: "Tom's Bali", destination: "Bali", startDate: day(-9), endDate: day(-3), status: "ARCHIVED", memberCount: 3, alreadyMember: false }));
    await renderApp("/join/OLD123");
    expect(await screen.findByText(/This trip has finished/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join trip" })).toBeNull();
  });

  test("cancelling a pending invite can be undone, which invites them again", async () => {
    const t = seedTrip(server.db);
    server.db.members[t.tripId].push(member(t, { userId: 9, username: "Pat" }, { inviteStatus: "PENDING" }));
    server.on("delete", "/trips/:id/members/:mid", (q) => { server.db.members[t.tripId] = server.db.members[t.tripId].filter((m) => m.tripMemberId !== Number(q.params.mid)); return null; });
    server.on("post", "/trips/:id/members/invite", (q) => { const m = member(t, { userId: 9, username: "Pat" }, { inviteStatus: "PENDING", email: q.body.email }); server.db.members[t.tripId].push(m); return m; });
    const { user } = await renderApp(`/trip/${t.tripId}/overview`);
    await user.click(await screen.findByRole("button", { name: "Cancel invite for Pat" }));
    await waitFor(() => expect(toastText()).toContain("Invite to Pat cancelled"));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(server.sent("post", `/trips/${t.tripId}/members/invite`)).toHaveLength(1));
    expect(server.sent("post", `/trips/${t.tripId}/members/invite`)[0].body).toEqual({ email: "pat@example.test" });
    expect(await screen.findByRole("button", { name: "Cancel invite for Pat" })).toBeInTheDocument();
  });
});

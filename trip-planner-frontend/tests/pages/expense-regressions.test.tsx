import { afterEach, expect, test, vi } from "vitest";
import { within } from "@testing-library/react";
import { renderApp, screen, waitFor, dialog } from "../render";
import { reply, server } from "../server";
import { day, expense, seedTrip, ME, TOM } from "../fixtures";
import { expenseApi } from "../../src/api/expenseApi";

afterEach(() => vi.restoreAllMocks());

async function addForm() {
  const t = seedTrip(server.db);
  const result = await renderApp(`/trip/${t.tripId}/expenses`);
  await screen.findByText("No expenses yet.");
  await result.user.click(screen.getAllByRole("button", { name: "Add Expense" })[0]);
  await result.user.type(screen.getByLabelText("Description"), "Tickets");
  return { t, ...result };
}

test("By Item derives a read-only total and participants from the items, including zero-cent allocations", async () => {
  const { t, user } = await addForm();
  const save = vi.spyOn(expenseApi, "save").mockResolvedValue(expense(t));
  // A selection in Equal must not restrict the members available to individual items.
  await user.click(screen.getByRole("checkbox", { name: /Tom/ }));
  await user.type(screen.getByLabelText("Amount", { exact: true }), "12");
  await user.click(screen.getByRole("button", { name: "By Item" }));
  const amount = screen.getByLabelText("Amount", { exact: true });
  expect(amount).toHaveAttribute("readonly");
  expect(amount).toHaveValue(0);
  expect(within(document.querySelector(".ef-rows") as HTMLElement).queryByRole("checkbox")).toBeNull();
  expect(screen.getByRole("heading", { name: "Total per person" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("Item name"), "Entry");
  await user.type(screen.getByLabelText("Unit price (AUD)"), "0.01");
  await user.click(screen.getByRole("checkbox", { name: /Mia/ }));
  await user.click(screen.getByRole("checkbox", { name: /Tom/ }));
  expect(amount).toHaveValue(0.01);
  const rows = document.querySelector(".ef-rows") as HTMLElement;
  expect(within(rows).getByText("Mia").closest(".ef-row")).toHaveTextContent("A$0.01");
  expect(within(rows).getByText("Tom").closest(".ef-row")).toHaveTextContent("A$0.00");
  await user.click(screen.getByRole("button", { name: "Save Expense" }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(save.mock.calls[0][1]).toMatchObject({ amount: "0.01", splitMode: "BY_ITEM", participants: [{ userId: ME.userId }, { userId: TOM.userId }] });
});

test("item quantities update the total; unassigned items block saving; mode switches preserve the Equal draft", async () => {
  const { t, user } = await addForm();
  const save = vi.spyOn(expenseApi, "save").mockResolvedValue(expense(t));
  await user.type(screen.getByLabelText("Amount", { exact: true }), "12");
  await user.click(screen.getByRole("button", { name: "By Item" }));
  await user.type(screen.getByLabelText("Item name"), "Ticket");
  await user.type(screen.getByLabelText("Unit price (AUD)"), "10");
  await user.type(screen.getByLabelText("Quantity (optional)"), "3");
  expect(screen.getByLabelText("Amount", { exact: true })).toHaveValue(30);
  expect(screen.getByText(/Assigned A\$0.00 · 1 item needs participants/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save Expense" }));
  expect(screen.getByText("Assign all items before saving.")).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByRole("checkbox", { name: /Mia/ }));
  await user.click(screen.getByRole("button", { name: "Add Item" }));
  expect(screen.getAllByLabelText("Item name")[1]).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Equal", exact: true }));
  expect(screen.getByLabelText("Amount", { exact: true })).not.toHaveAttribute("readonly");
  expect(screen.getByLabelText("Amount", { exact: true })).toHaveValue(12);
  await user.click(screen.getByRole("button", { name: "Custom", exact: true }));
  expect(screen.getByLabelText("Share for Mia")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "By Item" }));
  expect(screen.getByLabelText("Amount", { exact: true })).toHaveValue(30);
  expect(screen.getAllByLabelText("Item name")).toHaveLength(2);
});

test("former item participants stay visible until explicitly removed, then the item can be saved", async () => {
  const t = seedTrip(server.db), former = { userId: 99, username: "Former", shareAmount: 20, originalShareAmount: 20 };
  const original = expense(t, { splitMode: "BY_ITEM", shares: [{ userId: ME.userId, username: ME.username, shareAmount: 20, originalShareAmount: 20 }, former],
    items: [{ name: "Tickets", amount: 40, quantity: 1, allocations: [{ userId: ME.userId, username: ME.username, shareAmount: 20 }, former] }] });
  server.db.expenses[t.tripId] = [original];
  const save = vi.spyOn(expenseApi, "save").mockResolvedValue(original);
  const { user } = await renderApp(`/trip/${t.tripId}/expenses`);
  await user.click((await screen.findByText("Ferry tickets")).closest("tr")!);
  await user.click(within(dialog()!).getByRole("button", { name: "Edit expense" }));
  expect(within(document.querySelector(".ef-rows") as HTMLElement).getByText("Former").closest(".ef-row")).toHaveTextContent("A$20.00");
  await user.click(screen.getByRole("button", { name: "Save Expense" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByText("Remove former members from their items and review the split before saving.")).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: /Former member #99/ }));
  await user.click(screen.getByRole("button", { name: "Save Expense" }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(save.mock.calls[0][1]).toMatchObject({ amount: "40.00", participants: [{ userId: ME.userId }], items: [{ name: "Tickets", userIds: [ME.userId] }] });
});

async function failedReceipt() {
  const r = await addForm();
  const saved = expense(r.t, { expenseId: 900, description: "Tickets" });
  const save = vi.spyOn(expenseApi, "save").mockImplementation(async () => { server.db.expenses[r.t.tripId] = [saved]; return saved; });
  const upload = vi.spyOn(expenseApi, "uploadReceipt").mockRejectedValueOnce(new Error("receipt failed")).mockResolvedValue(saved);
  await r.user.type(screen.getByLabelText("Amount", { exact: true }), "30");
  await r.user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "receipt.png", { type: "image/png" }));
  await r.user.click(screen.getByRole("button", { name: "Save Expense" }));
  await screen.findByText("Expense saved. Receipt upload failed.");
  return { ...r, save, upload };
}

test("retrying a receipt uploads against the saved ID without creating or updating another expense", async () => {
  const { t, user, save, upload } = await failedReceipt();
  await user.click(screen.getByRole("button", { name: "Retry receipt upload" }));
  await screen.findByRole("heading", { name: /Expense history/ });
  expect(save).toHaveBeenCalledTimes(1);
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls.map((c) => c.slice(0, 2))).toEqual([[t.tripId, 900], [t.tripId, 900]]);
});

test("editing after a receipt failure updates the same expense ID", async () => {
  const { user, save } = await failedReceipt();
  await user.clear(screen.getByLabelText("Amount", { exact: true }));
  await user.type(screen.getByLabelText("Amount", { exact: true }), "35");
  await user.click(screen.getByRole("button", { name: "Save Expense" }));
  await screen.findByRole("heading", { name: /Expense history/ });
  expect(save.mock.calls.map((c) => c[2])).toEqual([undefined, 900]);
  expect(save.mock.calls[1][1].amount).toBe("35.00");
});

test("leaving a failed receipt form still shows the expense that was saved", async () => {
  const { user, save } = await failedReceipt();
  await user.click(screen.getByRole("button", { name: "Track", exact: true }));
  expect(await screen.findByText("Tickets")).toBeInTheDocument();
  expect(save).toHaveBeenCalledTimes(1);
});

test("receipt-only retry does not discard edits made after the expense was saved", async () => {
  const { user, save } = await failedReceipt();
  await user.clear(screen.getByLabelText("Description"));
  await user.type(screen.getByLabelText("Description"), "Changed tickets");
  await user.click(screen.getByRole("button", { name: "Retry receipt upload" }));
  await screen.findByText("Receipt saved. Save Expense to keep your other changes.");
  expect(screen.getByLabelText("Description")).toHaveValue("Changed tickets");
  expect(save).toHaveBeenCalledTimes(1);
});

test("Personal history includes zero-share participants but excludes payer-only expenses", async () => {
  const t = seedTrip(server.db);
  const theirs = { userId: TOM.userId, username: TOM.username, shareAmount: 40, originalShareAmount: 40 };
  server.db.expenses[t.tripId] = [expense(t, { description: "Zero share participation", currentUserShare: 0,
    shares: [{ userId: ME.userId, username: ME.username, shareAmount: 0, originalShareAmount: 0 }, theirs] }), expense(t, { description: "Paid for Tom", currentUserShare: 0, shares: [theirs] })];
  const { user } = await renderApp(`/trip/${t.tripId}/expenses`);
  await screen.findByText("Zero share participation");
  await user.click(screen.getByRole("button", { name: "Personal", exact: true }));
  expect(screen.getByText("Zero share participation")).toBeInTheDocument();
  expect(screen.queryByText("Paid for Tom")).toBeNull();
  expect(screen.getByText("My share").closest("section")).toHaveTextContent("A$0.00");
});

test("Track scope and filters survive Balances and editing, and reset when switching trips", async () => {
  const t = seedTrip(server.db), other = seedTrip(server.db, { name: "Bali" });
  server.db.expenses[t.tripId] = [expense(t)];
  server.db.expenses[other.tripId] = [expense(other, { description: "Bali ferry" })];
  const { user } = await renderApp(`/trip/${t.tripId}/expenses`);
  await user.type(await screen.findByPlaceholderText("Search expenses..."), "Ferry");
  await user.selectOptions(screen.getByLabelText("Category"), "Transport");
  await user.selectOptions(screen.getByLabelText("Paid by"), String(ME.userId));
  await user.type(screen.getByLabelText("From"), day(-2));
  await user.type(screen.getByLabelText("To"), day(2));
  await user.click(screen.getByRole("button", { name: "Personal", exact: true }));
  await user.click(screen.getByRole("button", { name: "Balances", exact: true }));
  await screen.findByText("All net balances are settled.");
  await user.click(screen.getByRole("button", { name: "Track", exact: true }));
  await user.click(screen.getByText("Ferry tickets").closest("tr")!);
  await user.click(within(dialog()!).getByRole("button", { name: "Edit expense" }));
  await user.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.getByPlaceholderText("Search expenses...")).toHaveValue("Ferry");
  expect(screen.getByLabelText("Category")).toHaveValue("Transport");
  expect(screen.getByLabelText("Paid by")).toHaveValue(String(ME.userId));
  expect(screen.getByLabelText("From")).toHaveValue(day(-2));
  expect(screen.getByLabelText("To")).toHaveValue(day(2));
  expect(screen.getByRole("button", { name: "Personal", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Navigate through the app's actual trip switcher.
  await user.click(screen.getByRole("button", { name: /Sydney weekend.*Sydney/ }));
  await user.click(within(screen.getByRole("menu")).getByRole("menuitemradio", { name: /Bali/ }));
  await screen.findByText("Bali ferry");
  expect(screen.getByPlaceholderText("Search expenses...")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Trip", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test.each([10, 0, -1])("payment rejection refreshes limits without losing the amount (new limit %s)", async (nextLimit) => {
  const t = seedTrip(server.db);
  let limit = 30;
  server.on("get", "/trips/:id/balances", () => limit < 0 ? reply(503, { message: "Unavailable" }) : ({ netBalance: -limit, totalYouOwe: limit, totalYouAreOwed: 0,
    youOwe: [{ userId: TOM.userId, name: TOM.username, amount: limit }], youAreOwed: [], eligiblePayees: limit ? [{ userId: TOM.userId, name: TOM.username, amount: limit }] : [] }));
  server.on("post", "/trips/:id/settlements", () => { limit = nextLimit; return reply(400, { message: "Balance changed" }); });
  const { user } = await renderApp(`/trip/${t.tripId}/expenses`);
  await screen.findByText("No expenses yet.");
  await user.click(screen.getByRole("button", { name: "Balances", exact: true }));
  await user.click(await screen.findByRole("button", { name: "Record Payment", exact: true }));
  const d = within(dialog()!);
  await user.type(d.getByLabelText("Amount (AUD)"), "30");
  await user.click(d.getByRole("button", { name: "Record Payment", exact: true }));
  await d.findByText("Balance changed");
  expect(d.getByLabelText("Amount (AUD)")).toHaveValue(30);
  if (nextLimit > 0) {
    await d.findByText("Current net payment limit: A$10.00");
    await user.click(d.getByRole("button", { name: "Record Payment", exact: true }));
    expect(d.getByText("The current net payment limit is A$10.00.")).toBeInTheDocument();
  } else if (nextLimit === 0) {
    await d.findByText(/This member is no longer an eligible payee/);
    expect(d.getByRole("button", { name: "Record Payment", exact: true })).toBeDisabled();
  } else {
    await d.findByText("Could not refresh balances. Retry before recording this payment.");
    expect(d.getByRole("button", { name: "Record Payment", exact: true })).toBeDisabled();
    limit = 10;
    await user.click(d.getByRole("button", { name: "Retry balances" }));
    await d.findByText("Current net payment limit: A$10.00");
    expect(d.getByLabelText("Amount (AUD)")).toHaveValue(30);
  }
  expect(server.sent("post", `/trips/${t.tripId}/settlements`)).toHaveLength(1);
});

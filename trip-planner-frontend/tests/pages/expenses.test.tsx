import { describe, expect, test } from "vitest";
import { within } from "@testing-library/react";
import { renderApp, screen, waitFor, dialog, drawer } from "../render";
import { server } from "../server";
import { expense, seedTrip, TOM } from "../fixtures";

describe("Expenses", () => {
  test("the history lists expenses; a row opens its detail, and a participant opens their profile", async () => {
    const t = seedTrip(server.db);
    server.db.expenses[t.tripId] = [expense(t, { description: "Ferry tickets", amount: 40, originalAmount: 40 })];
    const { user } = await renderApp(`/trip/${t.tripId}/expenses`);
    const row = (await screen.findByText("Ferry tickets")).closest("tr")!;
    expect(row).toHaveTextContent("A$40.00");
    await user.click(row);
    const d = dialog()!;
    await user.click(within(d).getAllByRole("button", { name: `${TOM.username} profile` }).at(-1)!);
    await waitFor(() => expect(within(drawer()!).getByRole("heading", { name: TOM.username })).toBeInTheDocument());
  });

  test("filters narrow the history and say when nothing matches", async () => {
    const t = seedTrip(server.db);
    server.db.expenses[t.tripId] = [expense(t, { description: "Ferry tickets" }), expense(t, { description: "Dumplings", category: "Food" })];
    const { user } = await renderApp(`/trip/${t.tripId}/expenses`);
    await user.type(await screen.findByPlaceholderText("Search expenses..."), "dump");
    expect(screen.queryByText("Ferry tickets")).toBeNull();
    expect(screen.getByText("Dumplings")).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText("Search expenses..."));
    await user.type(screen.getByPlaceholderText("Search expenses..."), "taxi");
    expect(screen.getByText("No expenses match your current search or filters.")).toBeInTheDocument();
  });

  test("adding an expense checks the description and amount, then saves an equal split", async () => {
    const t = seedTrip(server.db);
    let body: Record<string, unknown> | null = null;
    server.on("post", "/trips/:id/expenses", (q) => { body = q.body; return expense(t, { description: q.body.description }); });
    const { user } = await renderApp(`/trip/${t.tripId}/expenses`);
    await screen.findByText("No expenses yet.");
    await user.click(screen.getAllByRole("button", { name: "Add Expense" })[0]);
    await user.click(screen.getByRole("button", { name: /Save Expense/ }));
    expect(screen.getByText("Enter a description.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Description"), "Harbour cruise");
    await user.click(screen.getByRole("button", { name: /Save Expense/ }));
    expect(screen.getByText("Enter a positive amount with at most two decimal places.")).toBeInTheDocument();
    await user.type(document.querySelector<HTMLInputElement>('input[type="number"]')!, "90");
    await user.click(screen.getByRole("button", { name: /Save Expense/ }));
    await waitFor(() => expect(body).toMatchObject({ description: "Harbour cruise", amount: "90.00", splitMode: "EQUAL" }));
  });

  test("an empty trip invites the first expense", async () => {
    const t = seedTrip(server.db);
    await renderApp(`/trip/${t.tripId}/expenses`);
    expect(await screen.findByText("No expenses yet.")).toBeInTheDocument();
  });
});

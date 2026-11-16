import { expect, test } from "vitest";
import { within } from "@testing-library/react";
import { renderApp, screen, waitFor } from "../render";
import { server } from "../server";
import { activity, expense, seedTrip, TOM } from "../fixtures";

async function openForm() {
  const t = seedTrip(server.db), a = activity(t);
  server.db.activities[t.tripId] = [a];
  const result = await renderApp(`/trip/${t.tripId}/expenses`);
  await screen.findByText("No expenses yet.");
  await result.user.click(screen.getAllByRole("button", { name: "Add Expense" })[0]);
  return { ...result, t, a };
}

test("the app menus select category, activity, currency and payer without submitting the form", async () => {
  const { user, t, a } = await openForm();
  let body: Record<string, unknown> | null = null;
  server.on("post", "/trips/:id/expenses", (q) => { body = q.body; return expense(t); });
  for (const [label, option] of [["Category", "Culture"], ["Activity", /Sydney Opera House/], ["Expense currency", "USD"], ["Paid by", TOM.username]] as const) {
    const trigger = screen.getByRole("combobox", { name: label, exact: true });
    expect(trigger.tagName).toBe("BUTTON");
    await user.click(trigger);
    await user.click(within(screen.getByRole("listbox", { name: label })).getByRole("option", { name: option, exact: typeof option === "string" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger).toHaveFocus();
  }
  expect(body).toBeNull();
  await user.type(screen.getByLabelText("Description"), "Tickets");
  await user.type(screen.getByLabelText("Amount", { exact: true }), "24");
  await user.click(screen.getByRole("button", { name: "Save Expense" }));
  await waitFor(() => expect(body).toMatchObject({ category: "Culture", activityId: a.id, currencyCode: "USD", payerId: TOM.userId, amount: "24.00" }));
});

test("keyboard navigation, typeahead, Escape and Tab work without losing focus or changing an abandoned selection", async () => {
  const { user } = await openForm();
  const currency = screen.getByRole("combobox", { name: "Expense currency" });
  await user.click(currency);
  await user.keyboard("usd");
  expect(document.getElementById(currency.getAttribute("aria-activedescendant")!)).toHaveTextContent("USD");
  await user.keyboard("{Escape}");
  expect(currency).toHaveTextContent("AUD");
  expect(currency).toHaveFocus();
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  expect(currency).toHaveTextContent("USD");
  expect(currency).toHaveAttribute("aria-expanded", "false");
  await user.keyboard("{ArrowDown}{End}{Home}{Tab}");
  expect(currency).toHaveTextContent("AUD");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(screen.getByRole("combobox", { name: "Paid by" })).toHaveFocus();
  await user.click(currency);
  await user.click(screen.getByLabelText("Description"));
  expect(currency).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByLabelText("Description")).toHaveFocus();
});

test("Display in uses the app currency menu and does not change the expense's currency or computed Amount", async () => {
  const { user, t } = await openForm();
  let requested = false;
  server.on("get", `/trips/${t.tripId}/currency-rate`, () => { requested = true; return { rate: 0.7, date: t.startDate }; });
  await user.click(screen.getByRole("button", { name: "By Item" }));
  await user.type(screen.getByLabelText("Unit price (AUD)"), "12");
  const display = screen.getByRole("combobox", { name: "Display currency" });
  await user.click(display);
  await user.click(within(screen.getByRole("listbox", { name: "Display currency" })).getByRole("option", { name: "USD", exact: true }));
  await waitFor(() => expect(requested).toBe(true));
  expect(display).toHaveTextContent("USD");
  expect(screen.getByRole("combobox", { name: "Expense currency" })).toHaveTextContent("AUD");
  expect(screen.getByLabelText("Amount", { exact: true })).toHaveValue(12);
  expect(screen.getByLabelText("Amount", { exact: true })).toHaveAttribute("readonly");
});

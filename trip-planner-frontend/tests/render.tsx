/* Renders the whole app at a URL, signed in as server.db.me, the way a user would arrive there. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect } from "vitest";
import App from "../src/App";

export async function renderApp(path: string, { signedIn = true } = {}) {
  if (signedIn) localStorage.setItem("token", "test-token");
  window.history.replaceState(null, "", path);
  const user = userEvent.setup();
  const view = render(<App />);
  // Wait for the real shell (its nav) or the sign-in / join page, not the boot or loading placeholder.
  await waitFor(() => expect(document.querySelector("nav.nav, #auth")).not.toBeNull(), { timeout: 5000 });
  // Pages are loaded on demand; wait until the page itself has replaced its loading placeholder.
  await waitFor(() => expect(document.querySelector(".page-loading")).toBeNull(), { timeout: 5000 });
  return { user, ...view };
}

/** The open modal dialog (a <dialog class="dlg">) or drawer. */
export const dialog = () => document.querySelector<HTMLElement>("dialog.dlg[open]");
export const drawer = () => document.querySelector<HTMLElement>("dialog.drawer[open]");
export const toastText = () => document.querySelector(".toast")?.textContent ?? "";
export { screen, waitFor };

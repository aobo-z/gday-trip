import { describe, expect, test } from "vitest";
import { renderApp, screen, waitFor } from "../render";
import { server } from "../server";
import { day, seedTrip } from "../fixtures";
import { reply } from "../server";

/** The form's submit: "Continue" when signing in, "Create account" when registering. */
const submit = () => screen.getByRole("button", { name: /^(Continue|Create account)$/ });

describe("Sign in and register", () => {
  test("shows a field error instead of calling the server when the form is incomplete", async () => {
    const { user } = await renderApp("/login", { signedIn: false });
    await user.click(submit());
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(submit());
    expect(screen.getByText("Email must be valid")).toBeInTheDocument();
    expect(server.sent("post", "/auth/login")).toHaveLength(0);
  });

  test("register checks the password length and that both passwords match", async () => {
    const { user } = await renderApp("/register", { signedIn: false });
    await user.type(screen.getByLabelText("Username"), "Mia");
    await user.type(screen.getByLabelText("Email"), "mia@example.test");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(submit());
    expect(screen.getByText("Password must be between 8 and 72 characters")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "long-enough-1");
    await user.type(screen.getByLabelText("Confirm"), "long-enough-2");
    await user.click(submit());
    expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
  });

  test("after signing in the user lands on their nearest trip, even if the last page was another trip", async () => {
    const later = seedTrip(server.db, { name: "Kyoto later", startDate: day(40), endDate: day(45) });
    const now = seedTrip(server.db, { name: "Under way", startDate: day(-1), endDate: day(2) });
    window.history.replaceState({ usr: { from: `/trip/${later.tripId}/overview` }, key: "x", idx: 0 }, "", "/login");
    const { user } = await renderApp("/login", { signedIn: false });
    await user.type(screen.getByLabelText("Email"), "mia@example.test");
    await user.type(screen.getByLabelText("Password"), "whatever-123");
    await user.click(submit());
    await waitFor(() => expect(window.location.pathname).toBe(`/trip/${now.tripId}/overview`));
  });

  test("a wrong password shows the server's message", async () => {
    server.on("post", "/auth/login", () => reply(401, { message: "Email or password is incorrect" }));
    const { user } = await renderApp("/login", { signedIn: false });
    await user.type(screen.getByLabelText("Email"), "mia@example.test");
    await user.type(screen.getByLabelText("Password"), "wrong-pass-1");
    await user.click(submit());
    expect(await screen.findByText("Email or password is incorrect")).toBeInTheDocument();
  });
});

describe("Theme picked on the sign-in page", () => {
  async function signInWith(pick?: string) {
    seedTrip(server.db);
    server.db.me.accentColor = "OCEAN";
    const { user } = await renderApp("/login", { signedIn: false });
    if (pick) await user.click(screen.getByRole("button", { name: `${pick} theme` }));
    await user.type(screen.getByLabelText("Email"), "mia@example.test");
    await user.type(screen.getByLabelText("Password"), "whatever-123");
    await user.click(submit());
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/trip\//));
  }

  test("a theme chosen before signing in is used afterwards and saved to the account", async () => {
    await signInWith("Midnight");
    expect(document.documentElement.dataset.palette).toBe("MIDNIGHT");
    await waitFor(() => expect(server.sent("put", "/users/me/preferences")).toHaveLength(1));
    expect(server.db.me.accentColor).toBe("MIDNIGHT");
  });

  test("without choosing one, the account keeps its own theme", async () => {
    await signInWith();
    expect(document.documentElement.dataset.palette).toBe("OCEAN");
    expect(server.sent("put", "/users/me/preferences")).toHaveLength(0);
  });
});

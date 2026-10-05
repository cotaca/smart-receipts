import { render, screen, waitFor, within } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";

import LoginPage from "./page";

const push = vi.fn();

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));

beforeEach(() => {
  push.mockClear();
  searchParams = new URLSearchParams();
});

const STRONG = "Kassenbon-2026";

function getForm() {
  const form = document.querySelector("form");
  if (!form) throw new Error("form not found");
  return within(form);
}

async function fillAndSubmit(email = "user@test.com", password = "hunter22") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(getForm().getByRole("button", { name: /log in/i }));
  return user;
}

describe("LoginPage", () => {
  it("has its own main landmark (it renders outside the app shell)", () => {
    render(<LoginPage />);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("defaults to login mode and switches to register on tab click", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    expect(
      getForm().getByRole("button", { name: "Log in" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Create account" }));

    // the switch-prompt at the bottom of the form only reads this way in register mode
    expect(screen.getByText("Already have an account?")).toBeInTheDocument();
    expect(
      getForm().getByRole("button", { name: "Create account" }),
    ).toBeInTheDocument();
  });

  it("shows a success state then navigates home on successful login", async () => {
    vi.spyOn(api, "login").mockResolvedValue({
      access_token: "token",
      token_type: "bearer",
    });
    const setAccessTokenSpy = vi.spyOn(api, "setAccessToken");

    render(<LoginPage />);
    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText("Signed in")).toBeInTheDocument(),
    );
    expect(setAccessTokenSpy).toHaveBeenCalledWith("token");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/receipts"), {
      timeout: 2000,
    });
  });

  it("shows 'Invalid email or password' on a 401", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new api.ApiError(401, "401"));

    render(<LoginPage />);
    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText("Invalid email or password")).toBeInTheDocument(),
    );
  });

  async function openRegister() {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole("tab", { name: "Create account" }));
    return user;
  }

  const submitRegister = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(getForm().getByRole("button", { name: /create account/i }));

  it("opens the register tab for ?tab=register", () => {
    searchParams = new URLSearchParams("tab=register");
    render(<LoginPage />);

    expect(screen.getByLabelText("Repeat password")).toBeInTheDocument();
  });

  it("ticks the password rules while typing and hides them on login", async () => {
    render(<LoginPage />);
    expect(screen.queryByText("A number")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Create account" }));
    const rule = (name: string) => screen.getByText(name).closest("li");
    expect(rule("A number")).toHaveAttribute("data-met", "false");

    await user.type(screen.getByLabelText("Password"), "a1");

    expect(rule("A number")).toHaveAttribute("data-met", "true");
    expect(rule("A lowercase letter")).toHaveAttribute("data-met", "true");
    expect(rule("An uppercase letter")).toHaveAttribute("data-met", "false");
    // no destructive styling before a submit attempt
    expect(rule("An uppercase letter")).not.toHaveClass("text-destructive");
  });

  it("makes no request and focuses the first invalid field", async () => {
    const spy = vi.spyOn(api, "register");
    const user = await openRegister();

    await user.type(screen.getByLabelText("Email"), "anna@web.de");
    await user.type(screen.getByLabelText("Password"), "weak");
    await user.type(screen.getByLabelText("Repeat password"), "weak");
    await submitRegister(user);

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Password")).toHaveFocus();
    expect(screen.getByLabelText("Password")).toBeInvalid();
    expect(screen.getByText("A number").closest("li")).toHaveClass(
      "text-destructive",
    );

    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), STRONG);
    await submitRegister(user);

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Repeat password")).toHaveFocus();
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
  });

  it("flags an invalid email after leaving the field", async () => {
    const user = await openRegister();

    await user.type(screen.getByLabelText("Email"), "anna@web");
    await user.tab();

    expect(
      screen.getByText("Enter an email address like name@example.com."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInvalid();
  });

  it("registers with valid input", async () => {
    const spy = vi
      .spyOn(api, "register")
      .mockResolvedValue({ access_token: "t", token_type: "bearer" });
    const user = await openRegister();

    await user.type(screen.getByLabelText("Email"), "anna@web.de");
    await user.type(screen.getByLabelText("Password"), STRONG);
    await user.type(screen.getByLabelText("Repeat password"), STRONG);
    await submitRegister(user);

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith("anna@web.de", STRONG),
    );
  });

  it("shows a 409 at the email field and offers to log in instead", async () => {
    vi.spyOn(api, "register").mockRejectedValue(new api.ApiError(409, "409"));
    const user = await openRegister();

    await user.type(screen.getByLabelText("Email"), "anna@web.de");
    await user.type(screen.getByLabelText("Password"), STRONG);
    await user.type(screen.getByLabelText("Repeat password"), STRONG);
    await submitRegister(user);

    await waitFor(() =>
      expect(
        screen.getByText("An account with this email already exists."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Email")).toBeInvalid();

    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(
      screen.getByText("An account with this email already exists."),
    ).toHaveAttribute("role", "alert");

    await user.click(screen.getByRole("button", { name: "Log in instead" }));

    expect(screen.queryByLabelText("Repeat password")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("anna@web.de");
  });

  it("maps a 422 from register to the policy message", async () => {
    vi.spyOn(api, "register").mockRejectedValue(
      new api.ApiError(422, "422", [{ loc: ["body", "password"] }]),
    );
    const user = await openRegister();

    await user.type(screen.getByLabelText("Email"), "anna@web.de");
    await user.type(screen.getByLabelText("Password"), STRONG);
    await user.type(screen.getByLabelText("Repeat password"), STRONG);
    await submitRegister(user);

    await waitFor(() =>
      expect(
        screen.getByText("This password doesn't meet the rules."),
      ).toBeInTheDocument(),
    );
  });

  it("exposes each rule's status as text and flags an overlong password", async () => {
    const user = await openRegister();
    const rule = (name: string) => screen.getByText(name).closest("li");
    expect(rule("A number")).toHaveTextContent("(not met)");

    await user.type(screen.getByLabelText("Password"), "a1");
    expect(rule("A number")).toHaveTextContent("(met)");

    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "ä".repeat(37));
    expect(screen.getByText(/Use at most 72 characters/)).toBeInTheDocument();
  });

  it("toggles both password fields with the eye button", async () => {
    const user = await openRegister();
    const toggle = screen.getByRole("button", { name: "Show/Hide password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Repeat password")).toHaveAttribute(
      "type",
      "text",
    );
  });

  it("shows a server-side email rejection at the email field", async () => {
    vi.spyOn(api, "register").mockRejectedValue(
      new api.ApiError(422, "422", [{ loc: ["body", "email"] }]),
    );
    const user = await openRegister();

    await user.type(screen.getByLabelText("Email"), "anna@example.test");
    await user.type(screen.getByLabelText("Password"), STRONG);
    await user.type(screen.getByLabelText("Repeat password"), STRONG);
    await user.click(screen.getByLabelText("Repeat password"));
    await submitRegister(user);

    await waitFor(() => expect(screen.getByLabelText("Email")).toBeInvalid());
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(
      screen.getByText("Enter an email address like name@example.com."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("This password doesn't meet the rules."),
    ).not.toBeInTheDocument();
  });
});

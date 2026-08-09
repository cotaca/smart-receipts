import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";

import LoginPage from "./page";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

beforeEach(() => {
  push.mockClear();
});

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
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"), {
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

  it("shows 'Email already registered' on a 409 during register", async () => {
    vi.spyOn(api, "register").mockRejectedValue(new api.ApiError(409, "409"));

    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole("tab", { name: "Create account" }));
    await user.type(screen.getByLabelText("Email"), "user@test.com");
    await user.type(screen.getByLabelText("Password"), "hunter22");
    await user.click(
      getForm().getByRole("button", { name: /create account/i }),
    );

    await waitFor(() =>
      expect(screen.getByText("Email already registered")).toBeInTheDocument(),
    );
  });
});

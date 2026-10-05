import { render, screen, waitFor, within } from "@/test/render";
import { render as rawRender } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import type { Me } from "@/lib/api";
import { MeProvider } from "@/lib/me-context";
import deMessages from "../../../../messages/de.json";

import SettingsPage from "./page";

const routerRefresh = vi.fn();
const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: routerReplace,
    refresh: routerRefresh,
  }),
}));

const ME: Me = {
  id: "1",
  email: "jane@example.com",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  number_format: "de-DE",
  default_currency: "EUR",
  language: "de",
};

function renderSettings(me: Me = ME, setMe = vi.fn()) {
  return {
    setMe,
    ...render(
      <MeProvider me={me} setMe={setMe}>
        <SettingsPage />
      </MeProvider>,
    ),
  };
}

beforeEach(() => {
  localStorage.clear();
  routerRefresh.mockClear();
  routerReplace.mockClear();
  document.cookie = "locale=; Path=/; Max-Age=0";
});

describe("SettingsPage", () => {
  it("leaves the main landmark to the app shell", () => {
    // The shell's SidebarInset is the one <main>; a page's own would nest a
    // second main landmark inside it (invalid HTML, two "main" landmarks).
    renderSettings();
    expect(screen.queryByRole("main")).toBeNull();
  });

  it("renders the Appearance, Amounts and Account cards", () => {
    renderSettings();

    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Amounts")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument();
  });

  it("switching number format calls updateMe and updates the preview", async () => {
    const setMe = vi.fn();
    vi.spyOn(api, "updateMe").mockResolvedValue({
      ...ME,
      number_format: "en-US",
    });

    const user = userEvent.setup();
    renderSettings(ME, setMe);

    expect(screen.getByText("1.248,55 EUR")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "1,234.56" }));

    await waitFor(() =>
      expect(api.updateMe).toHaveBeenCalledWith({ number_format: "en-US" }),
    );
    expect(setMe).toHaveBeenCalledWith({ ...ME, number_format: "en-US" });
  });

  it("shows an alert and keeps the old value when updateMe fails", async () => {
    const setMe = vi.fn();
    vi.spyOn(api, "updateMe").mockRejectedValue(new Error("network"));

    const user = userEvent.setup();
    renderSettings(ME, setMe);

    await user.click(screen.getByRole("tab", { name: "1,234.56" }));

    await waitFor(() =>
      expect(
        screen.getByText(/Couldn't save your changes/),
      ).toBeInTheDocument(),
    );
    expect(setMe).not.toHaveBeenCalled();
    // Preview still reflects the untouched de-DE default -- no optimistic update.
    expect(screen.getByText("1.248,55 EUR")).toBeInTheDocument();
  });

  it("shows an inline error when the current password is wrong", async () => {
    vi.spyOn(api, "changePassword").mockRejectedValue(
      new api.ApiError(400, "Incorrect current password"),
    );

    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Change password" }));
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Current password"),
      "wrong-password",
    );
    await user.type(
      within(dialog).getByLabelText("New password"),
      "New-password-123",
    );
    await user.type(
      within(dialog).getByLabelText("Repeat new password"),
      "New-password-123",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Change password" }),
    );

    await waitFor(() =>
      expect(
        within(dialog).getByText("Current password is incorrect."),
      ).toBeInTheDocument(),
    );
    expect(dialog).toBeInTheDocument();
  });

  it("requires the current password before sending anything", async () => {
    const spy = vi.spyOn(api, "changePassword").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Change password" }));
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("New password"),
      "New-password-123",
    );
    await user.type(
      within(dialog).getByLabelText("Repeat new password"),
      "New-password-123",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Change password" }),
    );

    expect(spy).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText("Current password")).toHaveFocus();
    expect(
      within(dialog).getByText("Enter your current password."),
    ).toBeInTheDocument();
  });

  it("maps a 422 from the server to the policy message", async () => {
    vi.spyOn(api, "changePassword").mockRejectedValue(
      new api.ApiError(422, "422", [{ loc: ["body", "new_password"] }]),
    );
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Change password" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Current password"), "old");
    await user.type(
      within(dialog).getByLabelText("New password"),
      "New-password-123",
    );
    await user.type(
      within(dialog).getByLabelText("Repeat new password"),
      "New-password-123",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Change password" }),
    );

    await waitFor(() =>
      expect(
        within(dialog).getByText("This password doesn't meet the rules."),
      ).toBeInTheDocument(),
    );
  });

  it("does not call changePassword for a weak password or a mismatch", async () => {
    const spy = vi.spyOn(api, "changePassword").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Change password" }));
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", {
      name: "Change password",
    });
    await user.type(
      within(dialog).getByLabelText("Current password"),
      "old-password",
    );

    await user.type(within(dialog).getByLabelText("New password"), "weak");
    await user.click(submit);
    expect(spy).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText("New password")).toHaveFocus();

    await user.clear(within(dialog).getByLabelText("New password"));
    await user.type(
      within(dialog).getByLabelText("New password"),
      "New-password-123",
    );
    await user.type(
      within(dialog).getByLabelText("Repeat new password"),
      "Other-password-123",
    );
    await user.click(submit);
    expect(spy).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText("Passwords don't match."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Repeat new password")).toHaveFocus();
  });

  it("shows an inline error when the delete-account password is wrong", async () => {
    vi.spyOn(api, "deleteAccount").mockRejectedValue(
      new api.ApiError(400, "Incorrect password"),
    );

    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    const dialog = screen.getByRole("alertdialog");
    await user.type(
      within(dialog).getByLabelText("Enter your password to confirm"),
      "wrong-password",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Delete account" }),
    );

    await waitFor(() =>
      expect(
        within(dialog).getByText("Password is incorrect."),
      ).toBeInTheDocument(),
    );
    expect(dialog).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("deletes the account and redirects to login on success", async () => {
    vi.spyOn(api, "deleteAccount").mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    const dialog = screen.getByRole("alertdialog");
    await user.type(
      within(dialog).getByLabelText("Enter your password to confirm"),
      "correct-password",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Delete account" }),
    );

    await waitFor(() =>
      expect(api.deleteAccount).toHaveBeenCalledWith("correct-password"),
    );
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/login"));
  });

  it("switching language calls updateMe and syncs the locale cookie", async () => {
    const setMe = vi.fn();
    vi.spyOn(api, "updateMe").mockResolvedValue({ ...ME, language: "en" });

    const user = userEvent.setup();
    renderSettings(ME, setMe);

    await user.click(screen.getByRole("tab", { name: "English" }));

    await waitFor(() =>
      expect(api.updateMe).toHaveBeenCalledWith({ language: "en" }),
    );
    expect(setMe).toHaveBeenCalledWith({ ...ME, language: "en" });
    expect(document.cookie).toContain("locale=en");
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it('setting theme to "System" removes the stored preference', async () => {
    localStorage.setItem("theme", "dark");

    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("tab", { name: "System" }));

    await waitFor(() => expect(localStorage.getItem("theme")).toBeNull());
  });

  // Renders once against the German catalog so a missing de.json key fails
  // here in the test run instead of showing up as a blank string in the app.
  // next-intl throws on a missing key when not in production.
  it("renders in German against the de.json catalog", () => {
    rawRender(
      <NextIntlClientProvider locale="de" messages={deMessages}>
        <MeProvider me={ME} setMe={vi.fn()}>
          <SettingsPage />
        </MeProvider>
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Einstellungen")).toBeInTheDocument();
    expect(screen.getByText("Darstellung")).toBeInTheDocument();
  });
});

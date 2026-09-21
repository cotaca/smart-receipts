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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
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
  document.cookie = "locale=; Path=/; Max-Age=0";
});

describe("SettingsPage", () => {
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
      "new-password123",
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

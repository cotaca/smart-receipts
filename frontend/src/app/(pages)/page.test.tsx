import { render, screen, waitFor, within } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import type { Me, ReceiptExtraction, ReceiptPublic } from "@/lib/api";
import { MeProvider } from "@/lib/me-context";
import enMessages from "../../../messages/en.json";

import ReceiptsPage from "./page";

// A client-side navigation (Link) updates the router's search params before
// window.location. `navSearch` simulates that; unset, the mock follows
// window.location like a direct page load.
let navSearch: string | null = null;
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(navSearch ?? window.location.search),
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

function renderPage() {
  return render(
    <MeProvider me={ME} setMe={vi.fn()}>
      <ReceiptsPage />
    </MeProvider>,
  );
}

const NO_EXTRACTION: ReceiptExtraction = {
  merchant: null,
  amount: null,
  purchased_at: null,
  items: [],
  low_quality: false,
};

function receipt(overrides: Partial<ReceiptPublic>): ReceiptPublic {
  return {
    id: "r1",
    original_filename: "receipt.jpg",
    content_type: "image/jpeg",
    file_size: 123,
    merchant: "Trader Joe's",
    amount: "12.34",
    currency: "EUR",
    purchased_at: "2024-01-15",
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    image_url: "/receipts/r1/image",
    items: [],
    ...overrides,
  };
}

const RECEIPT = receipt({});

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.spyOn(api, "getReceiptImageObjectUrl").mockResolvedValue("blob:fake-url");
  window.history.replaceState(null, "", "/");
  navSearch = null;
});

// Uploads a file, then waits for the scan phase to settle so the field
// inputs (swapped for Skeletons while isExtracting) are back in the DOM.
async function uploadAndWaitForScan(
  dialog: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
  file: File,
) {
  await user.upload(within(dialog).getByLabelText(/^Receipt image/), file);
  await waitFor(() => expect(api.extractReceipt).toHaveBeenCalled());
  await waitFor(() =>
    expect(within(dialog).getByLabelText(/^Merchant/)).toBeInTheDocument(),
  );
}

// Opens the date picker and picks today -- these tests don't care which date
// ends up in the field, just that one gets picked. The popover renders via a
// portal outside `dialog`, so the day button is queried from the whole
// document; "Today, ..." is the accessible name react-day-picker gives it.
async function pickDate(
  dialog: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(within(dialog).getByLabelText(/^Purchase date/));
  await user.click(await screen.findByRole("button", { name: /^Today,/ }));
}

describe("ReceiptsPage", () => {
  it("shows the empty state when there are no receipts", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );
  });

  it("shows an error message when the receipts list fails to load", async () => {
    vi.spyOn(api, "listReceipts").mockRejectedValue(new Error("network"));

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText(/Couldn't load your receipts/),
      ).toBeInTheDocument(),
    );
  });

  it("renders a table row for each receipt", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([RECEIPT]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument(),
    );
    const row = screen.getByRole("row", { name: /Trader Joe's/ });
    // Twice: the date column (sm+) and the line under the merchant (mobile).
    expect(within(row).getAllByText("2024-01-15")).toHaveLength(2);
    expect(within(row).getByText("12,34 EUR")).toBeInTheDocument();
  });

  // Regression test: the ICU plural must render "1 receipt", not the
  // pre-i18n bug of "1 receipts", for a single tracked receipt.
  it("uses the singular form of the summary for exactly one receipt", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([RECEIPT]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/1 receipt ·/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/1 receipts/)).not.toBeInTheDocument();
  });

  it("shows all receipts by default (no period filter applied)", async () => {
    const old = receipt({
      id: "old",
      merchant: "Old Shop",
      purchased_at: "2020-01-01",
    });
    vi.spyOn(api, "listReceipts").mockResolvedValue([RECEIPT, old]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument(),
    );
    expect(screen.getByText("Old Shop")).toBeInTheDocument();
  });

  it("filters the table by merchant search", async () => {
    const other = receipt({ id: "r2", merchant: "dm-drogerie markt" });
    vi.spyOn(api, "listReceipts").mockResolvedValue([RECEIPT, other]);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument(),
    );

    await user.type(
      screen.getByPlaceholderText("Search merchants, items, notes…"),
      "trader",
    );

    expect(screen.getByText("Trader Joe's")).toBeInTheDocument();
    expect(screen.queryByText("dm-drogerie markt")).not.toBeInTheDocument();
  });

  it("hides receipts outside the selected period", async () => {
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
    const recent = receipt({
      id: "recent",
      merchant: "This Month Shop",
      purchased_at: "2026-09-10",
    });
    const old = receipt({
      id: "old",
      merchant: "Old Shop",
      purchased_at: "2020-01-01",
    });
    vi.spyOn(api, "listReceipts").mockResolvedValue([recent, old]);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("This Month Shop")).toBeInTheDocument(),
    );
    // Default is "all" — nothing hidden until a period is chosen.
    expect(screen.getByText("Old Shop")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Period: All time" }));
    await user.click(await screen.findByRole("button", { name: "This month" }));

    expect(screen.getByText("This Month Shop")).toBeInTheDocument();
    expect(screen.queryByText("Old Shop")).not.toBeInTheDocument();
  });

  // Regression test: without `items` on Select, Base UI's SelectValue renders
  // the raw value ("all", "this-month") in the trigger instead of the item's
  // label, so the filters showed untranslated internal strings.
  it("shows the selected filter's label in the trigger, not its raw value", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);

    const user = userEvent.setup();
    renderPage();

    const period = screen.getByRole("button", { name: "Period: All time" });
    const sort = screen.getByRole("combobox", { name: "Sort order" });
    // The StableLabel holds every label in textContent, so assert the raw
    // value is absent and read the visible (non-aria-hidden) span.
    expect(sort).not.toHaveTextContent("newest");
    expect(
      sort.querySelector("span.inline-grid > span:not([aria-hidden])"),
    ).toHaveTextContent("Sort: Newest");

    await user.click(period);
    const preset = await screen.findByRole("button", { name: "This month" });
    expect(preset).toHaveAttribute("aria-pressed", "false");
    await user.click(preset);

    expect(
      screen.getByRole("button", { name: "Period: This month" }),
    ).toBeInTheDocument();
    expect(period).not.toHaveTextContent("this-month");
  });

  it("sorts the table by amount", async () => {
    const cheap = receipt({
      id: "cheap",
      merchant: "Cheap Shop",
      amount: "1.00",
    });
    const pricey = receipt({
      id: "pricey",
      merchant: "Pricey Shop",
      amount: "99.00",
    });
    vi.spyOn(api, "listReceipts").mockResolvedValue([cheap, pricey]);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Cheap Shop")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("combobox", { name: "Sort order" }));
    await user.click(
      await screen.findByRole("option", { name: /Amount \(high to low\)/ }),
    );

    const rows = screen.getAllByRole("row").slice(1); // drop header row
    expect(within(rows[0]).getByText("Pricey Shop")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Cheap Shop")).toBeInTheDocument();
  });

  describe("filters", () => {
    const SEARCH = "Search merchants, items, notes…";
    const milk = receipt({
      id: "milk",
      merchant: "Rewe",
      purchased_at: "2026-09-10",
      amount: "20.00",
      items: [
        {
          description: "Milch 1l",
          quantity: "1",
          unit_price: "1.00",
          total_price: "1.00",
        },
      ],
    });
    const pdf = receipt({
      id: "pdf",
      merchant: "Telekom",
      content_type: "application/pdf",
      purchased_at: "2026-08-05",
      amount: "40.00",
    });
    const usd = receipt({
      id: "usd",
      merchant: "Dollar Shop",
      currency: "USD",
      purchased_at: "2026-08-01",
      amount: "30.00",
    });

    async function renderLoaded(...list: ReceiptPublic[]) {
      vi.spyOn(api, "listReceipts").mockResolvedValue(list);
      renderPage();
      await waitFor(() =>
        expect(screen.getAllByText(list[0].merchant).length).toBeGreaterThan(0),
      );
    }

    it("finds a receipt by line item and shows the hit", async () => {
      const user = userEvent.setup();
      await renderLoaded(milk, pdf);

      await user.type(screen.getByPlaceholderText(SEARCH), "milch");

      const row = screen.getByRole("row", { name: /Rewe/ });
      expect(within(row).getByText(/Line item: Milch 1l/)).toBeInTheDocument();
      expect(screen.queryByText("Telekom")).not.toBeInTheDocument();
    });

    it("filters by file type", async () => {
      const user = userEvent.setup();
      await renderLoaded(milk, pdf);

      await user.click(screen.getByRole("combobox", { name: "File type" }));
      await user.click(await screen.findByRole("option", { name: "PDFs" }));

      expect(screen.getByText("Telekom")).toBeInTheDocument();
      expect(screen.queryByText("Rewe")).not.toBeInTheDocument();
    });

    it("applies an amount range in the default currency and shows a chip", async () => {
      const user = userEvent.setup();
      await renderLoaded(milk, pdf, usd);

      await user.click(screen.getByRole("button", { name: "Amount" }));
      await user.type(screen.getByLabelText("Min"), "10");
      await user.type(screen.getByLabelText("Max"), "25,50");
      await user.click(screen.getByRole("button", { name: "Apply" }));

      expect(screen.getByText("Rewe")).toBeInTheDocument();
      expect(screen.queryByText("Telekom")).not.toBeInTheDocument();
      expect(screen.queryByText("Dollar Shop")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: "Remove filter 10,00–25,50 EUR",
        }),
      ).toBeInTheDocument();
    });

    it("removes a chip and clears all filters", async () => {
      const user = userEvent.setup();
      await renderLoaded(milk, pdf);

      await user.type(screen.getByPlaceholderText(SEARCH), "rewe");
      await user.click(screen.getByRole("combobox", { name: "File type" }));
      await user.click(await screen.findByRole("option", { name: "Photos" }));
      expect(screen.getByText(/1 of 2 receipts/)).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "Remove filter Photos" }),
      );
      expect(screen.getByText(/1 of 2 receipts/)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Remove filter Photos" }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Clear all" }));
      expect(screen.getByText("Telekom")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(SEARCH)).toHaveValue("");
    });

    it("offers to clear filters when nothing matches", async () => {
      const user = userEvent.setup();
      await renderLoaded(milk);

      await user.type(screen.getByPlaceholderText(SEARCH), "zzz");
      expect(
        screen.getByText("No receipts match your filters"),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(screen.getByText("Rewe")).toBeInTheDocument();
    });

    it("groups by month with a total when sorted by date only", async () => {
      const user = userEvent.setup();
      await renderLoaded(milk, pdf);

      expect(screen.getByText(/^September 2026/)).toBeInTheDocument();
      expect(screen.getByText(/^August 2026/)).toBeInTheDocument();
      expect(
        screen.getByText(/20,00 EUR/, { selector: "span" }),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("combobox", { name: "Sort order" }));
      await user.click(
        await screen.findByRole("option", { name: /Amount \(high to low\)/ }),
      );
      expect(screen.queryByText(/^September 2026/)).not.toBeInTheDocument();
    });

    it("reads the initial filters from the URL", async () => {
      window.history.replaceState(null, "", "/?q=rewe&type=image");
      await renderLoaded(milk, pdf);

      expect(screen.getByPlaceholderText(SEARCH)).toHaveValue("rewe");
      expect(
        screen.getByRole("button", { name: "Remove filter Photos" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Telekom")).not.toBeInTheDocument();
      // Still in the URL after the mirror effect ran.
      const params = new URLSearchParams(window.location.search);
      expect(params.get("q")).toBe("rewe");
      expect(params.get("type")).toBe("image");
    });

    it("mirrors filters into the URL and keeps ?receipt=", async () => {
      const user = userEvent.setup();
      await renderLoaded(milk, pdf);

      await user.type(screen.getByPlaceholderText(SEARCH), "rewe");
      await user.click(screen.getByRole("row", { name: /Rewe/ }));

      await waitFor(() => {
        const params = new URLSearchParams(window.location.search);
        expect(params.get("q")).toBe("rewe");
        expect(params.get("receipt")).toBe("milk");
      });
    });

    it("re-reads the filters when an outside navigation changes the URL", async () => {
      window.history.replaceState(null, "", "/?type=pdf");
      vi.spyOn(api, "listReceipts").mockResolvedValue([milk, pdf]);
      const { rerender } = renderPage();
      await waitFor(() =>
        expect(screen.getByText("Telekom")).toBeInTheDocument(),
      );
      expect(
        screen.getByRole("button", { name: "Remove filter PDFs" }),
      ).toBeInTheDocument();

      // e.g. the sidebar's "Receipts" link: searchParams change, no remount.
      navSearch = "";
      rerender(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <MeProvider me={ME} setMe={vi.fn()}>
            <ReceiptsPage />
          </MeProvider>
        </NextIntlClientProvider>,
      );

      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "Remove filter PDFs" }),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByText("Rewe")).toBeInTheDocument();
    });

    describe("mobile sheet", () => {
      async function openSheet(user: ReturnType<typeof userEvent.setup>) {
        await user.click(screen.getByRole("button", { name: /^Filters/ }));
        return within(await screen.findByRole("dialog"));
      }

      it("applies nothing when closed without Show", async () => {
        const user = userEvent.setup();
        await renderLoaded(milk, pdf);

        const sheet = await openSheet(user);
        await user.click(sheet.getByRole("tab", { name: "PDFs" }));
        await user.keyboard("{Escape}");

        await waitFor(() =>
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );
        expect(screen.getByText("Rewe")).toBeInTheDocument();
        expect(screen.getByText("Telekom")).toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: "Remove filter PDFs" }),
        ).not.toBeInTheDocument();
      });

      it("shows the draft's count and applies it on Show", async () => {
        const user = userEvent.setup();
        await renderLoaded(milk, pdf);

        const sheet = await openSheet(user);
        expect(
          sheet.getByRole("button", { name: "Show 2 receipts" }),
        ).toBeInTheDocument();
        await user.click(sheet.getByRole("tab", { name: "PDFs" }));
        await user.click(sheet.getByRole("button", { name: "Show 1 receipt" }));

        await waitFor(() =>
          expect(screen.queryByText("Rewe")).not.toBeInTheDocument(),
        );
        expect(screen.getByText("Telekom")).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Filters, 1 active" }),
        ).toBeInTheDocument();
      });

      it("disables Show while an amount is invalid", async () => {
        const user = userEvent.setup();
        await renderLoaded(milk, pdf);

        const sheet = await openSheet(user);
        await user.type(sheet.getByLabelText("Min"), "abc");

        expect(sheet.getByRole("button", { name: /^Show/ })).toBeDisabled();
        expect(sheet.getByLabelText("Min")).toHaveAttribute(
          "aria-invalid",
          "true",
        );
        expect(sheet.getByLabelText("Max")).not.toHaveAttribute("aria-invalid");
        expect(sheet.getByLabelText("Min")).toHaveAccessibleDescription(
          "Enter a valid amount.",
        );
      });

      it("resets the draft but keeps search and sort", async () => {
        const user = userEvent.setup();
        await renderLoaded(milk, pdf);

        let sheet = await openSheet(user);
        await user.click(sheet.getByRole("tab", { name: "PDFs" }));
        await user.click(sheet.getByRole("button", { name: /^Show/ }));
        await waitFor(() =>
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );

        sheet = await openSheet(user);
        await user.click(sheet.getByRole("button", { name: "Reset" }));
        await user.click(sheet.getByRole("button", { name: /^Show/ }));

        await waitFor(() =>
          expect(screen.getByText("Rewe")).toBeInTheDocument(),
        );
        expect(
          screen.queryByRole("button", { name: "Remove filter PDFs" }),
        ).not.toBeInTheDocument();
      });

      it("keeps a custom period after Show", async () => {
        const user = userEvent.setup();
        window.history.replaceState(
          null,
          "",
          "/?period=custom&from=2026-09-01&to=2026-09-30",
        );
        await renderLoaded(milk, pdf);

        const sheet = await openSheet(user);
        await user.click(sheet.getByRole("tab", { name: "Photos" }));
        await user.click(sheet.getByRole("button", { name: /^Show/ }));

        await waitFor(() =>
          expect(
            screen.getByRole("button", { name: "Remove filter Photos" }),
          ).toBeInTheDocument(),
        );
        expect(
          screen.getByRole("button", {
            name: "Remove filter 01.09.2026 – 30.09.2026",
          }),
        ).toBeInTheDocument();
      });
    });

    it("moves focus into the period popover when it opens", async () => {
      const user = userEvent.setup();
      await renderLoaded(milk, pdf);

      await user.click(screen.getByRole("button", { name: /^Period/ }));

      const popup = await screen.findByRole("dialog");
      await waitFor(() =>
        expect(popup).toContainElement(document.activeElement as HTMLElement),
      );
      expect(document.activeElement).not.toBe(
        screen.getByRole("button", { name: /^Period/ }),
      );
    });

    it("sets a custom range from the calendar and closes the popover", async () => {
      vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
      const user = userEvent.setup();
      await renderLoaded(milk, pdf);

      await user.click(screen.getByRole("button", { name: /^Period/ }));
      const popup = within(await screen.findByRole("dialog"));
      await user.click(popup.getByRole("button", { name: /September 1st/ }));
      await user.click(popup.getByRole("button", { name: /September 10th/ }));

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(
        screen.getByRole("button", { name: "Period: Custom range" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: "Remove filter 01.09.2026 – 10.09.2026",
        }),
      ).toBeInTheDocument();
    });

    it("keeps the applied range while a new one is half-picked", async () => {
      vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
      window.history.replaceState(
        null,
        "",
        "/?period=custom&from=2026-09-01&to=2026-09-10",
      );
      const user = userEvent.setup();
      await renderLoaded(milk, pdf);

      await user.click(screen.getByRole("button", { name: /^Period/ }));
      const popup = within(await screen.findByRole("dialog"));
      await user.click(popup.getByRole("button", { name: /September 15th/ }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: "Remove filter 01.09.2026 – 10.09.2026",
        }),
      ).toBeInTheDocument();
      expect(window.location.search).toContain("to=2026-09-10");
    });

    it("picks a single-day range with two clicks on the same day", async () => {
      vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
      const user = userEvent.setup();
      await renderLoaded(milk, pdf);

      await user.click(screen.getByRole("button", { name: /^Period/ }));
      const popup = within(await screen.findByRole("dialog"));
      await user.click(popup.getByRole("button", { name: /September 1st/ }));
      await user.click(popup.getByRole("button", { name: /September 1st/ }));

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(
        screen.getByRole("button", {
          name: "Remove filter 01.09.2026 – 01.09.2026",
        }),
      ).toBeInTheDocument();
    });

    it("keeps the amount button label and flags it when active", async () => {
      const user = userEvent.setup();
      await renderLoaded(milk, pdf);

      expect(screen.getByRole("button", { name: "Amount" })).toHaveTextContent(
        "Amount",
      );
      await user.click(screen.getByRole("button", { name: "Amount" }));
      await user.type(screen.getByLabelText("Min"), "10");
      await user.click(screen.getByRole("button", { name: "Apply" }));

      const active = screen.getByRole("button", { name: "Amount, active" });
      expect(active).toHaveTextContent("Amount");
      expect(active).not.toHaveTextContent("10,00");
    });

    it("shows no count while loading or when the account has no receipts", async () => {
      vi.spyOn(api, "listReceipts").mockResolvedValue([]);
      renderPage();

      expect(screen.queryByText(/^d+ receipts?$/)).not.toBeInTheDocument();
      await screen.findByText("No receipts yet");
      expect(screen.queryByText("0 receipts")).not.toBeInTheDocument();
    });

    it("shows the plain total without filters", async () => {
      await renderLoaded(milk, pdf);

      expect(screen.getByText("2 receipts")).toBeInTheDocument();
    });

    it("shows a custom range chip from the URL", async () => {
      window.history.replaceState(
        null,
        "",
        "/?period=custom&from=2026-09-01&to=2026-09-30",
      );
      await renderLoaded(milk, pdf);

      expect(
        screen.getByRole("button", {
          name: "Remove filter 01.09.2026 – 30.09.2026",
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Telekom")).not.toBeInTheDocument();
    });
  });

  it("creates a receipt and adds it to the list", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);
    vi.spyOn(api, "extractReceipt").mockResolvedValue(NO_EXTRACTION);
    vi.spyOn(api, "createReceipt").mockResolvedValue(RECEIPT);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Upload your first receipt" }),
    );

    const dialog = screen.getByRole("dialog");
    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await uploadAndWaitForScan(dialog, user, file);

    await user.type(within(dialog).getByLabelText(/^Merchant/), "Trader Joe's");
    await user.type(within(dialog).getByLabelText(/^Amount/), "12.34");
    await pickDate(dialog, user);

    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(api.createReceipt).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument(),
    );
  });

  it("navigates the date picker via caption → month → year to pick a specific date", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);
    vi.spyOn(api, "extractReceipt").mockResolvedValue(NO_EXTRACTION);
    vi.spyOn(api, "createReceipt").mockResolvedValue(RECEIPT);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Upload your first receipt" }),
    );

    const dialog = screen.getByRole("dialog");
    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await uploadAndWaitForScan(dialog, user, file);

    await user.type(within(dialog).getByLabelText(/^Merchant/), "Trader Joe's");
    await user.type(within(dialog).getByLabelText(/^Amount/), "12.34");

    await user.click(within(dialog).getByLabelText(/^Purchase date/));
    await user.click(
      await screen.findByRole("button", { name: /Choose month/ }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Choose year/ }),
    );

    // "Previous years" paging is only needed if the current run's year isn't
    // already on the same 12-year page as 2024.
    let yearButton = screen.queryByRole("button", { name: "2024" });
    while (!yearButton) {
      await user.click(screen.getByRole("button", { name: "Previous years" }));
      yearButton = screen.queryByRole("button", { name: "2024" });
    }
    await user.click(yearButton);
    await user.click(await screen.findByRole("button", { name: "Jan" }));
    await user.click(
      await screen.findByRole("button", { name: /January 15th, 2024/ }),
    );

    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(api.createReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ purchased_at: "2024-01-15" }),
      ),
    );
  });

  it("normalizes a comma decimal separator before sending", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);
    vi.spyOn(api, "extractReceipt").mockResolvedValue(NO_EXTRACTION);
    vi.spyOn(api, "createReceipt").mockResolvedValue(RECEIPT);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Upload your first receipt" }),
    );

    const dialog = screen.getByRole("dialog");
    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await uploadAndWaitForScan(dialog, user, file);

    await user.type(within(dialog).getByLabelText(/^Merchant/), "Trader Joe's");
    await user.type(within(dialog).getByLabelText(/^Amount/), "12,34");
    await pickDate(dialog, user);

    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(api.createReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ amount: "12.34" }),
      ),
    );
  });

  it("rejects an invalid amount without calling createReceipt", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);
    vi.spyOn(api, "extractReceipt").mockResolvedValue(NO_EXTRACTION);
    vi.spyOn(api, "createReceipt").mockResolvedValue(RECEIPT);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Upload your first receipt" }),
    );

    const dialog = screen.getByRole("dialog");
    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await uploadAndWaitForScan(dialog, user, file);

    await user.type(within(dialog).getByLabelText(/^Merchant/), "Trader Joe's");
    await user.type(within(dialog).getByLabelText(/^Amount/), "not-a-number");
    await pickDate(dialog, user);

    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(
        within(dialog).getByText(/enter a valid amount/i),
      ).toBeInTheDocument(),
    );
    expect(api.createReceipt).not.toHaveBeenCalled();
  });

  it("shows a progress indicator while scanning, then reveals the fields", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);
    let resolveExtraction!: (value: ReceiptExtraction) => void;
    vi.spyOn(api, "extractReceipt").mockReturnValue(
      new Promise((resolve) => {
        resolveExtraction = resolve;
      }),
    );

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Upload your first receipt" }),
    );
    const dialog = screen.getByRole("dialog");
    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(within(dialog).getByLabelText(/^Receipt image/), file);

    await waitFor(() =>
      expect(
        within(dialog).getByText("Reading your receipt…"),
      ).toBeInTheDocument(),
    );
    expect(
      within(dialog).queryByLabelText(/^Merchant/),
    ).not.toBeInTheDocument();

    resolveExtraction(NO_EXTRACTION);

    await waitFor(() =>
      expect(
        within(dialog).queryByText("Reading your receipt…"),
      ).not.toBeInTheDocument(),
    );
    expect(within(dialog).getByLabelText(/^Merchant/)).toBeInTheDocument();
  });

  it("marks an undetected field as 'Not detected' and counts found fields", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);
    vi.spyOn(api, "extractReceipt").mockResolvedValue({
      merchant: "REWE Markt",
      amount: "12.34",
      purchased_at: null,
      items: [],
      low_quality: false,
    });

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Upload your first receipt" }),
    );
    const dialog = screen.getByRole("dialog");
    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await uploadAndWaitForScan(dialog, user, file);

    expect(
      within(dialog).getByText("2 of 3 fields found."),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Not detected")).toBeInTheDocument();
  });

  it("never overwrites a value the user already typed", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);
    vi.spyOn(api, "extractReceipt").mockResolvedValue(NO_EXTRACTION);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Upload your first receipt" }),
    );
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText(/^Merchant/),
      "Hand-typed merchant",
    );

    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await uploadAndWaitForScan(dialog, user, file);

    expect(within(dialog).getByLabelText(/^Merchant/)).toHaveValue(
      "Hand-typed merchant",
    );
  });

  it("keeps the form usable without an error banner when extraction fails", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);
    vi.spyOn(api, "extractReceipt").mockRejectedValue(new Error("network"));

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Upload your first receipt" }),
    );

    const dialog = screen.getByRole("dialog");
    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await uploadAndWaitForScan(dialog, user, file);

    expect(
      within(dialog).queryByText(/couldn't|something went wrong/i),
    ).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Merchant/), "Trader Joe's");
    expect(within(dialog).getByLabelText(/^Merchant/)).toHaveValue(
      "Trader Joe's",
    );
  });

  it("deletes a receipt from the detail dialog and closes the detail too", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([RECEIPT]);
    vi.spyOn(api, "deleteReceipt").mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("row", { name: /Trader Joe's/ }));
    const detailDialog = await screen.findByRole("dialog", {
      name: "Trader Joe's",
    });
    await user.click(
      within(detailDialog).getByRole("button", { name: "Delete" }),
    );

    const confirmDialog = await screen.findByRole("alertdialog");
    expect(
      within(confirmDialog).getByText("2024-01-15 · 12,34 EUR"),
    ).toBeInTheDocument();

    await user.click(
      within(confirmDialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => expect(api.deleteReceipt).toHaveBeenCalledWith("r1"));
    await waitFor(() =>
      expect(screen.queryByText("Trader Joe's")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("dialog", { name: "Trader Joe's" }),
    ).not.toBeInTheDocument();
  });

  it("opens the detail dialog on row click and mirrors the id into the URL", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([RECEIPT]);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("row", { name: /Trader Joe's/ }));

    expect(
      await screen.findByRole("dialog", { name: "Trader Joe's" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe("?receipt=r1"));

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Trader Joe's" }),
      ).not.toBeInTheDocument(),
    );
    expect(window.location.search).toBe("");
  });

  it("opens the detail dialog on mount from a ?receipt= URL", async () => {
    window.history.replaceState(null, "", "/?receipt=r1");
    vi.spyOn(api, "listReceipts").mockResolvedValue([RECEIPT]);

    renderPage();

    expect(
      await screen.findByRole("dialog", { name: "Trader Joe's" }),
    ).toBeInTheDocument();
  });

  it("opens the detail dialog when a client-side navigation sets ?receipt= before window.location", async () => {
    navSearch = "?receipt=r1";
    vi.spyOn(api, "listReceipts").mockResolvedValue([RECEIPT]);

    renderPage();

    expect(
      await screen.findByRole("dialog", { name: "Trader Joe's" }),
    ).toBeInTheDocument();
  });

  it("does not open a dialog and strips an unknown ?receipt= id", async () => {
    window.history.replaceState(null, "", "/?receipt=does-not-exist");
    vi.spyOn(api, "listReceipts").mockResolvedValue([RECEIPT]);

    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument(),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("edits a receipt from the detail dialog and reflects the change there", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([RECEIPT]);
    const updated = receipt({ merchant: "Trader Joe's Renamed" });
    vi.spyOn(api, "updateReceipt").mockResolvedValue(updated);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("row", { name: /Trader Joe's/ }));
    const detailDialog = await screen.findByRole("dialog", {
      name: "Trader Joe's",
    });
    await user.click(
      within(detailDialog).getByRole("button", { name: "Edit" }),
    );

    const editDialog = await screen.findByRole("dialog", {
      name: "Edit receipt",
    });
    await user.click(
      within(editDialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => expect(api.updateReceipt).toHaveBeenCalled());
    expect(
      await screen.findByRole("dialog", { name: "Trader Joe's Renamed" }),
    ).toBeInTheDocument();
  });

  it("Escape in the edit dialog (opened from detail) closes only the edit dialog", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([RECEIPT]);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("row", { name: /Trader Joe's/ }));
    const detailDialog = await screen.findByRole("dialog", {
      name: "Trader Joe's",
    });
    await user.click(
      within(detailDialog).getByRole("button", { name: "Edit" }),
    );
    await screen.findByRole("dialog", { name: "Edit receipt" });

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Edit receipt" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("dialog", { name: "Trader Joe's" }),
    ).toBeInTheDocument();
  });
});

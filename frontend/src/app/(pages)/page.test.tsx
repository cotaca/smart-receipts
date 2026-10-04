import { render, screen, waitFor, within } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import type { Me, ReceiptExtraction, ReceiptPublic } from "@/lib/api";
import { MeProvider } from "@/lib/me-context";

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
    expect(within(row).getByText("2024-01-15")).toBeInTheDocument();
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

    await user.type(screen.getByPlaceholderText("Search receipts…"), "trader");

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

    await user.click(screen.getByRole("combobox", { name: "Period" }));
    await user.click(await screen.findByRole("option", { name: "This month" }));

    expect(screen.getByText("This Month Shop")).toBeInTheDocument();
    expect(screen.queryByText("Old Shop")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  // Regression test: without `items` on Select, Base UI's SelectValue renders
  // the raw value ("all", "this-month") in the trigger instead of the item's
  // label, so the filters showed untranslated internal strings.
  it("shows the selected filter's label in the trigger, not its raw value", async () => {
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);

    const user = userEvent.setup();
    renderPage();

    const period = screen.getByRole("combobox", { name: "Period" });
    const sort = screen.getByRole("combobox", { name: "Sort order" });
    expect(period).toHaveTextContent("All time");
    expect(sort).toHaveTextContent("Sort: Newest");

    await user.click(period);
    await user.click(await screen.findByRole("option", { name: "This month" }));

    expect(period).toHaveTextContent("This month");
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

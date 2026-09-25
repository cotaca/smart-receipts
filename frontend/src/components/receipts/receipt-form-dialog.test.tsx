import { render, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import type { ReceiptPublic } from "@/lib/api";

import { ReceiptFormDialog } from "./receipt-form-dialog";

const RECEIPT: ReceiptPublic = {
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
};

function renderDialog(
  receipt: ReceiptPublic | undefined,
  onSaved = vi.fn(),
  onOpenChange = vi.fn(),
  numberFormat = "en-US",
) {
  render(
    <ReceiptFormDialog
      open
      onOpenChange={onOpenChange}
      receipt={receipt}
      defaultCurrency="EUR"
      numberFormat={numberFormat}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onOpenChange };
}

beforeEach(() => {
  vi.spyOn(api, "getReceiptImageObjectUrl").mockResolvedValue("blob:fake-url");
});

describe("ReceiptFormDialog image controls", () => {
  it("shows Replace file and Zoom in edit mode", async () => {
    renderDialog(RECEIPT);

    expect(
      await screen.findByRole("button", { name: /Replace file/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Zoom/ })).toBeInTheDocument();
  });

  it("hides Zoom in create mode until a file is selected", async () => {
    renderDialog(undefined);

    expect(
      screen.queryByRole("button", { name: /Zoom/ }),
    ).not.toBeInTheDocument();

    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    vi.spyOn(api, "extractReceipt").mockResolvedValue({
      merchant: null,
      amount: null,
      purchased_at: null,
      items: [],
      low_quality: false,
    });
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/^Receipt image/), file);

    expect(
      await screen.findByRole("button", { name: /Zoom/ }),
    ).toBeInTheDocument();
  });

  it("replaces the image on file selection and calls onSaved without closing the dialog", async () => {
    const updated = { ...RECEIPT, file_size: 999 };
    vi.spyOn(api, "replaceReceiptImage").mockResolvedValue(updated);
    const { onSaved, onOpenChange } = renderDialog(RECEIPT);

    const file = new File(["data"], "new.jpg", { type: "image/jpeg" });
    const user = userEvent.setup();
    await user.upload(
      screen.getByLabelText(/^Replace file/i, { selector: "input" }),
      file,
    );

    await waitFor(() =>
      expect(api.replaceReceiptImage).toHaveBeenCalledWith(RECEIPT.id, file),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("shows an error and does not call onSaved when replacing fails", async () => {
    vi.spyOn(api, "replaceReceiptImage").mockRejectedValue(
      new api.ApiError(400, "Bad Request"),
    );
    const { onSaved } = renderDialog(RECEIPT);

    const file = new File(["data"], "new.jpg", { type: "image/jpeg" });
    const user = userEvent.setup();
    await user.upload(
      screen.getByLabelText(/^Replace file/i, { selector: "input" }),
      file,
    );

    expect(
      await screen.findByText(
        "Couldn't replace the receipt image. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("opens and closes the zoom overlay", async () => {
    renderDialog(RECEIPT);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Zoom/ }));

    const zoomDialog = await screen.findByRole("dialog", {
      name: `${RECEIPT.merchant} receipt, enlarged`,
    });
    expect(zoomDialog).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: `${RECEIPT.merchant} receipt, enlarged`,
        }),
      ).not.toBeInTheDocument(),
    );

    // The point of stacking two Dialogs: Escape must close only the top one.
    // Asserting the edit form is still mounted is what proves it -- without
    // this, the test above passes just as happily if both dialogs closed.
    expect(screen.getByLabelText(/Merchant/)).toBeInTheDocument();
  });
});

describe("ReceiptFormDialog date picker", () => {
  it("shows the trigger formatted per number format", () => {
    renderDialog(RECEIPT, undefined, undefined, "de-DE");
    // The Label's `htmlFor` makes "Purchase date" the button's accessible
    // name, so the formatted date is asserted via its text content instead.
    expect(
      screen.getByRole("button", { name: "Purchase date" }),
    ).toHaveTextContent("15.01.2024");
  });

  it("shows the trigger formatted for en-US", () => {
    renderDialog(RECEIPT, undefined, undefined, "en-US");
    expect(
      screen.getByRole("button", { name: "Purchase date" }),
    ).toHaveTextContent("01/15/2024");
  });

  it("disables future days, months and years", async () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
    const receipt = { ...RECEIPT, purchased_at: "2024-06-01" };
    renderDialog(receipt);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Purchase date" }));

    expect(
      await screen.findByRole("button", { name: /June 20th, 2024/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Go to the Next Month" }),
    ).toHaveAttribute("aria-disabled", "true");

    await user.click(screen.getByRole("button", { name: /June 2024/ }));
    expect(screen.getByRole("button", { name: "Jul" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Jan" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /2024, Choose year/ }));
    expect(screen.getByRole("button", { name: "2025" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "2023" })).toBeEnabled();

    vi.useRealTimers();
  });

  it("closes the popover after picking a day", async () => {
    renderDialog(RECEIPT);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Purchase date" }));
    await user.click(
      await screen.findByRole("button", { name: /January 20th, 2024/ }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /January 20th, 2024/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows an error and skips the API call when no date is picked", async () => {
    vi.spyOn(api, "extractReceipt").mockResolvedValue({
      merchant: null,
      amount: null,
      purchased_at: null,
      items: [],
      low_quality: false,
    });
    vi.spyOn(api, "createReceipt");
    renderDialog(undefined);
    const user = userEvent.setup();

    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/^Receipt image/), file);
    await screen.findByLabelText(/^Merchant/);

    await user.type(screen.getByLabelText(/^Merchant/), "Trader Joe's");
    await user.type(screen.getByLabelText(/^Amount/), "12.34");
    await user.click(screen.getByRole("button", { name: "Upload" }));

    expect(
      await screen.findByText("Please select a purchase date"),
    ).toBeInTheDocument();
    expect(api.createReceipt).not.toHaveBeenCalled();
  });
});

describe("ReceiptFormDialog low-quality hint", () => {
  it("shows the hint when the extraction is flagged low_quality", async () => {
    vi.spyOn(api, "extractReceipt").mockResolvedValue({
      merchant: null,
      amount: null,
      purchased_at: null,
      items: [],
      low_quality: true,
    });
    renderDialog(undefined);
    const user = userEvent.setup();

    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/^Receipt image/), file);

    expect(
      await screen.findByText("This image is hard to read"),
    ).toBeInTheDocument();
  });

  it("hides the hint when the extraction is not flagged low_quality", async () => {
    vi.spyOn(api, "extractReceipt").mockResolvedValue({
      merchant: null,
      amount: null,
      purchased_at: null,
      items: [],
      low_quality: false,
    });
    renderDialog(undefined);
    const user = userEvent.setup();

    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/^Receipt image/), file);
    await screen.findByLabelText(/^Merchant/);

    expect(
      screen.queryByText("This image is hard to read"),
    ).not.toBeInTheDocument();
  });
});

describe("ReceiptFormDialog line items", () => {
  it("shows the existing items in edit mode", async () => {
    const receipt = {
      ...RECEIPT,
      items: [
        {
          description: "Milch",
          quantity: "2.000",
          unit_price: "1.29",
          total_price: "2.58",
        },
      ],
    };
    renderDialog(receipt);

    expect(await screen.findByLabelText("Item 1 description")).toHaveValue(
      "Milch",
    );
    expect(screen.getByLabelText("Item 1 quantity")).toHaveValue("2.000");
    expect(screen.getByLabelText("Item 1 unit price")).toHaveValue("1.29");
    expect(screen.getByLabelText("Item 1 total")).toHaveValue("2.58");
  });

  it("fills the item table from extraction", async () => {
    vi.spyOn(api, "extractReceipt").mockResolvedValue({
      merchant: null,
      amount: null,
      purchased_at: null,
      items: [
        {
          description: "Milch",
          quantity: "1",
          unit_price: "1.29",
          total_price: "1.29",
        },
      ],
      low_quality: false,
    });
    renderDialog(undefined);
    const user = userEvent.setup();

    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/^Receipt image/), file);
    await screen.findByLabelText(/^Merchant/);

    expect(screen.getByLabelText("Item 1 description")).toHaveValue("Milch");
  });

  it("does not overwrite rows the user already added with extraction results", async () => {
    vi.spyOn(api, "extractReceipt").mockResolvedValue({
      merchant: null,
      amount: null,
      purchased_at: null,
      items: [
        {
          description: "Milch",
          quantity: "1",
          unit_price: "1.29",
          total_price: "1.29",
        },
      ],
      low_quality: false,
    });
    renderDialog(undefined);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(
      screen.getByLabelText("Item 1 description"),
      "Hand-typed item",
    );

    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/^Receipt image/), file);
    await screen.findByLabelText(/^Merchant/);

    expect(screen.getByLabelText("Item 1 description")).toHaveValue(
      "Hand-typed item",
    );
  });

  it("adds and removes item rows", async () => {
    renderDialog(RECEIPT);
    const user = userEvent.setup();

    expect(screen.getByText("No line items.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(screen.getByLabelText("Item 1 description")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove item 1" }));
    expect(screen.getByText("No line items.")).toBeInTheDocument();
  });

  it("recomputes the total when quantity or unit price changes", async () => {
    renderDialog(RECEIPT);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(screen.getByLabelText("Item 1 quantity"), "2");
    await user.type(screen.getByLabelText("Item 1 unit price"), "1.5");

    expect(screen.getByLabelText("Item 1 total")).toHaveValue("3.00");
  });

  it("shows an error and skips the API call for an invalid item row", async () => {
    vi.spyOn(api, "updateReceipt");
    renderDialog(RECEIPT);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(screen.getByLabelText("Item 1 quantity"), "1");
    await user.type(screen.getByLabelText("Item 1 unit price"), "1.29");
    await user.type(screen.getByLabelText("Item 1 total"), "1.29");
    // No description -- the row is not empty, so it must be complete.

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText(/Please check the line items/),
    ).toBeInTheDocument();
    expect(api.updateReceipt).not.toHaveBeenCalled();
  });

  it("shows exactly one Add item button and toggles the empty state", async () => {
    renderDialog(RECEIPT);

    expect(screen.getAllByRole("button", { name: "Add item" })).toHaveLength(1);
    expect(screen.getByText("No line items.")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(screen.getByLabelText("Item 1 description")).toBeInTheDocument();
    expect(screen.queryByText("No line items.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add item" })).toHaveLength(1);
  });

  it("shows the item sum and a mismatch hint against the amount", async () => {
    const receipt = {
      ...RECEIPT,
      amount: "3.58",
      items: [
        {
          description: "Milch",
          quantity: "2",
          unit_price: "1.29",
          total_price: "2.58",
        },
        {
          description: "Brot",
          quantity: "1",
          unit_price: "1.00",
          total_price: "1.00",
        },
      ],
    };
    renderDialog(receipt);
    const user = userEvent.setup();

    expect(await screen.findByText("3.58 EUR")).toBeInTheDocument();
    expect(
      screen.queryByText(/Differs from the amount/),
    ).not.toBeInTheDocument();

    const amountInput = screen.getByLabelText(/^Amount/);
    await user.clear(amountInput);
    await user.type(amountInput, "5.00");

    const hint = await screen.findByText(
      "Differs from the amount by 1.42 EUR.",
    );
    // Polite, not assertive: it re-renders on every keystroke in Amount.
    expect(hint.closest('[data-slot="alert"]')).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("excludes an invalid total row from the item sum", async () => {
    const receipt = {
      ...RECEIPT,
      items: [
        {
          description: "Milch",
          quantity: "2",
          unit_price: "1.29",
          total_price: "2.58",
        },
      ],
    };
    renderDialog(receipt);
    const user = userEvent.setup();

    expect(await screen.findByText("2.58 EUR")).toBeInTheDocument();

    // A second row with only an unparseable total: not empty (so not
    // dropped), but invalid, so the sum must stay at the first row's total.
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(screen.getByLabelText("Item 2 total"), "abc");

    expect(screen.getByText("2.58 EUR")).toBeInTheDocument();
  });

  it("shows the low-quality warning and the field counts as separate alerts", async () => {
    vi.spyOn(api, "extractReceipt").mockResolvedValue({
      merchant: null,
      amount: null,
      purchased_at: null,
      items: [],
      low_quality: true,
    });
    renderDialog(undefined);
    const user = userEvent.setup();

    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/^Receipt image/), file);

    const hint = await screen.findByText("This image is hard to read");
    const fields = await screen.findByText("0 of 3 fields found.");
    expect(hint.closest('[data-slot="alert"]')).not.toBe(
      fields.closest('[data-slot="alert"]'),
    );
  });

  it("sends normalized items on save", async () => {
    vi.spyOn(api, "updateReceipt").mockResolvedValue(RECEIPT);
    renderDialog(RECEIPT);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(screen.getByLabelText("Item 1 description"), "Milch");
    await user.type(screen.getByLabelText("Item 1 quantity"), "2");
    await user.type(screen.getByLabelText("Item 1 unit price"), "1,29");

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(api.updateReceipt).toHaveBeenCalledWith(
        RECEIPT.id,
        expect.objectContaining({
          items: [
            {
              description: "Milch",
              quantity: "2",
              unit_price: "1.29",
              total_price: "2.58",
            },
          ],
        }),
      ),
    );
  });
});

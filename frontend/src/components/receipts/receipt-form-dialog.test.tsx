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
};

function renderDialog(
  receipt: ReceiptPublic | undefined,
  onSaved = vi.fn(),
  onOpenChange = vi.fn(),
) {
  render(
    <ReceiptFormDialog
      open
      onOpenChange={onOpenChange}
      receipt={receipt}
      defaultCurrency="EUR"
      numberFormat="en-US"
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

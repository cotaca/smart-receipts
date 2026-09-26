import { render, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import type { ReceiptPublic } from "@/lib/api";

import { ReceiptDetailDialog } from "./receipt-detail-dialog";

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
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    image_url: "/receipts/r1/image",
    items: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(api, "getReceiptImageObjectUrl").mockResolvedValue("blob:fake-url");
});

function renderDialog(receiptOrNull: ReceiptPublic | null, overrides = {}) {
  const onOpenChange = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const utils = render(
    <ReceiptDetailDialog
      receipt={receiptOrNull}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
      onDelete={onDelete}
      numberFormat="de-DE"
      {...overrides}
    />,
  );
  return { ...utils, onOpenChange, onEdit, onDelete };
}

describe("ReceiptDetailDialog", () => {
  it("shows merchant, amount, purchase date and notes", () => {
    renderDialog(
      receipt({ notes: "Bought for the office", purchased_at: "2024-01-15" }),
    );

    expect(screen.getByText("Trader Joe's")).toBeInTheDocument();
    expect(screen.getByText("12,34 EUR")).toBeInTheDocument();
    expect(screen.getByText("15.01.2024")).toBeInTheDocument();
    expect(screen.getByText("Bought for the office")).toBeInTheDocument();
  });

  it("omits the notes block when there are no notes", () => {
    renderDialog(receipt({ notes: null }));
    expect(screen.queryByText(/notes/i)).not.toBeInTheDocument();
  });

  it("shows line item rows and their summed total", () => {
    renderDialog(
      receipt({
        currency: "EUR",
        items: [
          {
            description: "Coffee",
            quantity: "2.000",
            unit_price: "3.00",
            total_price: "6.00",
          },
          {
            description: "Milk",
            quantity: "0.500",
            unit_price: "3.00",
            total_price: "1.50",
          },
        ],
      }),
    );

    expect(screen.getByText("Coffee")).toBeInTheDocument();
    expect(screen.getByText("Milk")).toBeInTheDocument();
    // Backend sends Numeric(10, 3) -- "2.000" must render as "2".
    expect(screen.getByRole("cell", { name: "2" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "0,5" })).toBeInTheDocument();
    expect(screen.getByText(/2 positions/)).toBeInTheDocument();
    expect(screen.getByText(/7,50 EUR/)).toBeInTheDocument();
  });

  it("shows a 'no line items' message when there are none", () => {
    renderDialog(receipt({ items: [] }));
    expect(screen.getByText("No line items.")).toBeInTheDocument();
  });

  it("calls onEdit with the receipt", async () => {
    const user = userEvent.setup();
    const r = receipt({});
    const { onEdit } = renderDialog(r);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith(r);
  });

  it("calls onDelete with the receipt", async () => {
    const user = userEvent.setup();
    const r = receipt({});
    const { onDelete } = renderDialog(r);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(r);
  });

  it("shows a download link with the original filename once the image loads", async () => {
    renderDialog(receipt({ original_filename: "my-receipt.jpg" }));

    const link = await screen.findByRole("link", { name: /Download/ });
    expect(link).toHaveAttribute("href", "blob:fake-url");
    expect(link).toHaveAttribute("download", "my-receipt.jpg");
  });

  it("opens the zoom overlay from the Zoom button, and Escape closes only the zoom", async () => {
    const user = userEvent.setup();
    renderDialog(receipt({}));

    await user.click(await screen.findByRole("button", { name: /^Zoom$/ }));

    const zoomDialog = await screen.findByRole("dialog", {
      name: "Trader Joe's receipt, enlarged",
    });
    expect(zoomDialog).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Trader Joe's receipt, enlarged",
        }),
      ).not.toBeInTheDocument(),
    );

    // The detail dialog itself must still be open underneath.
    expect(
      screen.getByRole("heading", { name: "Trader Joe's" }),
    ).toBeInTheDocument();
  });

  it("renders nothing when receipt is null", () => {
    renderDialog(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

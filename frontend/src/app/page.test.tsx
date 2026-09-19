import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import type { ReceiptPublic } from "@/lib/api";

import HomePage from "./page";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

const ME = {
  id: "1",
  email: "jane@example.com",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};

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

function mockAuthenticated() {
  vi.spyOn(api, "refresh").mockResolvedValue({
    access_token: "token",
    token_type: "bearer",
  });
  vi.spyOn(api, "getMe").mockResolvedValue(ME);
}

beforeEach(() => {
  replace.mockClear();
  vi.spyOn(api, "getReceiptImageObjectUrl").mockResolvedValue("blob:fake-url");
});

describe("HomePage", () => {
  it("redirects to /login when the silent refresh fails", async () => {
    vi.spyOn(api, "refresh").mockRejectedValue(new api.ApiError(401, "401"));

    render(<HomePage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("shows the empty state when there are no receipts", async () => {
    mockAuthenticated();
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );
    expect(screen.getByText("JA")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows an error message when the receipts list fails to load", async () => {
    mockAuthenticated();
    vi.spyOn(api, "listReceipts").mockRejectedValue(new Error("network"));

    render(<HomePage />);

    await waitFor(() =>
      expect(
        screen.getByText(/Couldn't load your receipts/),
      ).toBeInTheDocument(),
    );
  });

  it("renders a table row for each receipt", async () => {
    mockAuthenticated();
    vi.spyOn(api, "listReceipts").mockResolvedValue([RECEIPT]);

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument(),
    );
    expect(screen.getByText("2024-01-15")).toBeInTheDocument();
    expect(screen.getByText("12.34 EUR")).toBeInTheDocument();
  });

  it("creates a receipt and adds it to the list", async () => {
    mockAuthenticated();
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);
    vi.spyOn(api, "createReceipt").mockResolvedValue(RECEIPT);

    const user = userEvent.setup();
    render(<HomePage />);
    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Upload your first receipt" }),
    );

    const dialog = screen.getByRole("dialog");
    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    // Labels include a visible "*" for required fields, so match by prefix
    // rather than the exact (now-stale) text.
    await user.upload(within(dialog).getByLabelText(/^Receipt image/), file);
    await user.type(within(dialog).getByLabelText(/^Merchant/), "Trader Joe's");
    await user.type(within(dialog).getByLabelText(/^Amount/), "12.34");
    // Native <input type="date"> has a segmented UI that user.type() can't
    // drive reliably — set the value directly instead.
    fireEvent.change(within(dialog).getByLabelText(/^Purchase date/), {
      target: { value: "2024-01-15" },
    });

    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(api.createReceipt).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument(),
    );
  });

  it("normalizes a comma decimal separator before sending", async () => {
    mockAuthenticated();
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);
    vi.spyOn(api, "createReceipt").mockResolvedValue(RECEIPT);

    const user = userEvent.setup();
    render(<HomePage />);
    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Upload your first receipt" }),
    );

    const dialog = screen.getByRole("dialog");
    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(within(dialog).getByLabelText(/^Receipt image/), file);
    await user.type(within(dialog).getByLabelText(/^Merchant/), "Trader Joe's");
    await user.type(within(dialog).getByLabelText(/^Amount/), "12,34");
    fireEvent.change(within(dialog).getByLabelText(/^Purchase date/), {
      target: { value: "2024-01-15" },
    });

    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(api.createReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ amount: "12.34" }),
      ),
    );
  });

  it("rejects an invalid amount without calling createReceipt", async () => {
    mockAuthenticated();
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);
    vi.spyOn(api, "createReceipt").mockResolvedValue(RECEIPT);

    const user = userEvent.setup();
    render(<HomePage />);
    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Upload your first receipt" }),
    );

    const dialog = screen.getByRole("dialog");
    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(within(dialog).getByLabelText(/^Receipt image/), file);
    await user.type(within(dialog).getByLabelText(/^Merchant/), "Trader Joe's");
    await user.type(within(dialog).getByLabelText(/^Amount/), "not-a-number");
    fireEvent.change(within(dialog).getByLabelText(/^Purchase date/), {
      target: { value: "2024-01-15" },
    });

    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(
        within(dialog).getByText(/enter a valid amount/i),
      ).toBeInTheDocument(),
    );
    expect(api.createReceipt).not.toHaveBeenCalled();
  });

  it("fills the form fields from extraction after selecting a file", async () => {
    mockAuthenticated();
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);
    vi.spyOn(api, "extractReceipt").mockResolvedValue({
      merchant: "REWE Markt",
      amount: "12.34",
      purchased_at: "2024-01-15",
    });

    const user = userEvent.setup();
    render(<HomePage />);
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
      expect(within(dialog).getByLabelText(/^Merchant/)).toHaveValue(
        "REWE Markt",
      ),
    );
    expect(within(dialog).getByLabelText(/^Amount/)).toHaveValue("12.34");
    expect(within(dialog).getByLabelText(/^Purchase date/)).toHaveValue(
      "2024-01-15",
    );
  });

  it("keeps the form usable without an error banner when extraction fails", async () => {
    mockAuthenticated();
    vi.spyOn(api, "listReceipts").mockResolvedValue([]);
    vi.spyOn(api, "extractReceipt").mockRejectedValue(new Error("network"));

    const user = userEvent.setup();
    render(<HomePage />);
    await waitFor(() =>
      expect(screen.getByText("No receipts yet")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Upload your first receipt" }),
    );

    const dialog = screen.getByRole("dialog");
    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(within(dialog).getByLabelText(/^Receipt image/), file);

    await waitFor(() => expect(api.extractReceipt).toHaveBeenCalled());
    expect(
      within(dialog).queryByText(/couldn't|something went wrong/i),
    ).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Merchant/), "Trader Joe's");
    expect(within(dialog).getByLabelText(/^Merchant/)).toHaveValue(
      "Trader Joe's",
    );
  });

  it("deletes a receipt after confirmation", async () => {
    mockAuthenticated();
    vi.spyOn(api, "listReceipts").mockResolvedValue([RECEIPT]);
    vi.spyOn(api, "deleteReceipt").mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<HomePage />);
    await waitFor(() =>
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Receipt actions" }));
    // The menu opens via an async floating-ui position calculation, so its
    // items aren't in the DOM synchronously right after the click.
    const deleteItem = await screen.findByRole("menuitem", { name: "Delete" });
    await user.click(deleteItem);

    const confirmDialog = await screen.findByRole("alertdialog");
    await user.click(
      within(confirmDialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => expect(api.deleteReceipt).toHaveBeenCalledWith("r1"));
    await waitFor(() =>
      expect(screen.queryByText("Trader Joe's")).not.toBeInTheDocument(),
    );
  });
});

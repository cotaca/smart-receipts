import { render, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import type { Me, ReceiptPublic } from "@/lib/api";
import { MeProvider } from "@/lib/me-context";

import { ReceiptsTable } from "./receipts-table";

const ME: Me = {
  id: "1",
  email: "jane@example.com",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  number_format: "de-DE",
  default_currency: "EUR",
  language: "de",
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

function renderTable(receipts: ReceiptPublic[], onOpen = vi.fn()) {
  return {
    onOpen,
    ...render(
      <MeProvider me={ME} setMe={vi.fn()}>
        <ReceiptsTable receipts={receipts} onOpen={onOpen} />
      </MeProvider>,
    ),
  };
}

beforeEach(() => {
  vi.spyOn(api, "getReceiptImageObjectUrl").mockResolvedValue("blob:fake-url");
});

describe("ReceiptsTable row click", () => {
  it("opens the receipt when the row is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderTable([receipt({})], onOpen);

    await user.click(screen.getByRole("row", { name: /Trader Joe's/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));
  });

  it("opens the receipt exactly once when Enter is pressed on the merchant button", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderTable([receipt({})], onOpen);

    await user.tab();
    await user.keyboard("{Enter}");

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("has no 'Receipt actions' button anymore", () => {
    renderTable([receipt({})]);
    expect(
      screen.queryByRole("button", { name: "Receipt actions" }),
    ).not.toBeInTheDocument();
  });
});

describe("ReceiptsTable hover preview", () => {
  it("opens the preview card on hover", async () => {
    const user = userEvent.setup();
    renderTable([receipt({})]);

    const row = screen.getByRole("row", { name: /Trader Joe's/ });
    await user.hover(row);

    // The preview card's image has alt="" (decorative — the row thumbnail
    // already carries the merchant as alt text), which gives it an implicit
    // presentation role instead of "img", so count raw <img> elements.
    await waitFor(() =>
      expect(document.querySelectorAll("img").length).toBeGreaterThan(1),
    );
  });

  it("shows no preview card for a PDF receipt", async () => {
    const user = userEvent.setup();
    renderTable([receipt({ content_type: "application/pdf" })]);

    await user.hover(screen.getByRole("row", { name: /Trader Joe's/ }));

    // Past the 250ms open delay, so a card would have mounted by now.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(
      document.querySelector('[data-slot="hover-card-content"]'),
    ).not.toBeInTheDocument();
  });

  // Regression test: the row is deliberately not focusable itself. Keyboard
  // support instead comes from onFocus bubbling up from the row's merchant
  // button, so focusing that button must still open the card.
  it("opens the preview card when the merchant button receives focus", async () => {
    const user = userEvent.setup();
    renderTable([receipt({})]);

    await user.tab();
    expect(screen.getByRole("button", { name: "Trader Joe's" })).toHaveFocus();

    await waitFor(() =>
      expect(document.querySelectorAll("img").length).toBeGreaterThan(1),
    );
  });

  // Counter-test against re-adding tabIndex to the row: no such tab stop
  // should exist.
  it("does not make the row itself a tab stop", () => {
    renderTable([receipt({})]);

    const row = screen.getByRole("row", { name: /Trader Joe's/ });
    expect(row).not.toHaveAttribute("tabindex");
  });

  it("does not fetch the receipt image a second time when hovering the row", async () => {
    const user = userEvent.setup();
    const receipts = [
      receipt({ id: "r1", merchant: "Trader Joe's" }),
      receipt({ id: "r2", merchant: "Aldi" }),
      receipt({ id: "r3", merchant: "Lidl" }),
    ];
    renderTable(receipts);

    await screen.findAllByRole("img");
    expect(api.getReceiptImageObjectUrl).toHaveBeenCalledTimes(3);

    const row = screen.getByRole("row", { name: /Trader Joe's/ });
    await user.hover(row);
    await waitFor(() =>
      expect(document.querySelectorAll("img").length).toBeGreaterThan(3),
    );

    expect(api.getReceiptImageObjectUrl).toHaveBeenCalledTimes(3);
  });
});

import { render, screen, waitFor } from "@/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";

import { ReceiptImage, refreshReceiptImage } from "./receipt-image";

beforeEach(() => {
  let call = 0;
  vi.spyOn(api, "getReceiptImageObjectUrl").mockImplementation(async () => {
    call += 1;
    return `blob:fake-url-${call}`;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("refreshReceiptImage", () => {
  it("updates every mounted consumer and revokes the old URL exactly once", async () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL");

    // Two consumers of the same receiptId, as in the receipts table row
    // still mounted behind an open edit dialog.
    render(
      <>
        <ReceiptImage receiptId="r1" alt="row" />
        <ReceiptImage receiptId="r1" alt="dialog" />
      </>,
    );

    const images = await screen.findAllByRole("img");
    await waitFor(() =>
      images.forEach((img) =>
        expect(img).toHaveAttribute("src", "blob:fake-url-1"),
      ),
    );

    await refreshReceiptImage("r1");

    await waitFor(() => {
      const updated = screen.getAllByRole("img");
      updated.forEach((img) =>
        expect(img).toHaveAttribute("src", "blob:fake-url-2"),
      );
    });

    expect(revokeSpy).toHaveBeenCalledWith("blob:fake-url-1");
    expect(revokeSpy).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when nothing is mounted for the receiptId", async () => {
    await expect(refreshReceiptImage("unmounted")).resolves.toBeUndefined();
    expect(api.getReceiptImageObjectUrl).not.toHaveBeenCalled();
  });
});

describe("ReceiptImage pdf tile", () => {
  it("renders a labelled tile and never fetches the PDF", async () => {
    render(<ReceiptImage receiptId="r1" alt="REWE receipt" pdf />);

    expect(
      screen.getByRole("img", { name: "REWE receipt" }),
    ).toBeInTheDocument();
    expect(api.getReceiptImageObjectUrl).not.toHaveBeenCalled();
  });

  it("hides a decorative tile (empty alt) from the accessibility tree", () => {
    const { container } = render(<ReceiptImage receiptId="r1" alt="" pdf />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector("[aria-hidden='true']")).toBeInTheDocument();
  });
});

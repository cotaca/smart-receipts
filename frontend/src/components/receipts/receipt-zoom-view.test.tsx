import { fireEvent, render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  clampOffset,
  containedSize,
  ReceiptZoomView,
} from "./receipt-zoom-view";

describe("containedSize", () => {
  // Regression test: clampView used to pass the <img> element's clientWidth,
  // which is always the full frame because the image is `w-full h-full
  // object-contain`. That let a tall receipt be dragged sideways out of view
  // on its letterboxed axis. The clamp must use the *painted* size instead.
  it("letterboxes a tall image horizontally inside a wide frame", () => {
    // 400x800 image in a 400x400 frame -> fit 0.5 -> painted 200x400.
    expect(containedSize(400, 400, 400, 800)).toEqual({
      width: 200,
      height: 400,
    });
  });

  it("letterboxes a wide image vertically inside a tall frame", () => {
    expect(containedSize(400, 400, 800, 400)).toEqual({
      width: 400,
      height: 200,
    });
  });

  it("returns zero while the image has not loaded yet", () => {
    expect(containedSize(400, 400, 0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("clampOffset", () => {
  it("keeps a fully visible (smaller-than-frame) image centered at 0", () => {
    expect(clampOffset(50, 1, 300, 200)).toBe(0);
  });

  it("clamps to the max offset when the scaled image exceeds the frame", () => {
    // scaled image = 200 * 2 = 400, frame = 300 -> max offset = 50
    expect(clampOffset(999, 2, 300, 200)).toBe(50);
    expect(clampOffset(-999, 2, 300, 200)).toBe(-50);
  });

  it("passes through an offset already inside the allowed range", () => {
    expect(clampOffset(20, 2, 300, 200)).toBe(20);
  });
});

function getTransform() {
  return screen.getByRole("img").style.transform;
}

describe("ReceiptZoomView", () => {
  it("starts at scale(1)", () => {
    render(<ReceiptZoomView src="blob:fake" alt="Receipt" />);
    expect(getTransform()).toContain("scale(1)");
  });

  it("zooms in and out via the toolbar buttons, and resets", async () => {
    render(<ReceiptZoomView src="blob:fake" alt="Receipt" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Zoom in/ }));
    expect(getTransform()).toContain("scale(1.25)");

    await user.click(screen.getByRole("button", { name: /Zoom out/ }));
    expect(getTransform()).toContain("scale(1)");

    await user.click(screen.getByRole("button", { name: /Zoom in/ }));
    await user.click(screen.getByRole("button", { name: /Reset/ }));
    expect(getTransform()).toContain("scale(1)");
  });

  it("zooms on a real wheel event dispatched on the frame", () => {
    render(<ReceiptZoomView src="blob:fake" alt="Receipt" />);
    const frame = screen.getByRole("img").parentElement as HTMLElement;

    // A real WheelEvent -- this is what proves the manually registered,
    // non-passive listener is wired up; React's onWheel wouldn't be reached
    // by this at all in the failure case this test guards against.
    fireEvent.wheel(frame, { deltaY: -100, clientX: 0, clientY: 0 });

    expect(getTransform()).not.toContain("scale(1)");
  });

  // Regression test: an <img> is natively draggable, so without this the
  // browser starts its own drag-and-drop on left-press and the pointermove
  // stream this component pans with never arrives.
  it("opts the image out of the browser's native image dragging", () => {
    render(<ReceiptZoomView src="blob:fake" alt="Receipt" />);
    expect(screen.getByRole("img")).toHaveAttribute("draggable", "false");
  });

  it("pans on a left-button drag but ignores other buttons", () => {
    render(<ReceiptZoomView src="blob:fake" alt="Receipt" />);
    const image = screen.getByRole("img");
    image.setPointerCapture = () => {};

    // Right button (2): must not start a pan, so the context menu can open
    // without leaving the image stuck to the cursor.
    fireEvent.pointerDown(image, { button: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(image, { clientX: 40, clientY: 25 });
    expect(getTransform()).toContain("translate(0px, 0px)");

    // Left button (0): pans.
    fireEvent.pointerDown(image, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(image, { clientX: 40, clientY: 25 });
    expect(getTransform()).toContain("translate(40px, 25px)");
  });

  it("exposes the zoom, reset, and pan controls as buttons", () => {
    render(<ReceiptZoomView src="blob:fake" alt="Receipt" />);
    expect(screen.getByRole("button", { name: /Zoom in/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Zoom out/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset/ })).toBeInTheDocument();
  });
});

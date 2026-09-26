"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Drag01Icon,
  MouseScroll01Icon,
  RefreshIcon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const BUTTON_STEP = 1.25;
// Per-wheel-event multiplier bounds -- without this a single fast trackpad
// swing (large deltaY in one event) would jump through the whole zoom range.
const MIN_WHEEL_FACTOR = 0.85;
const MAX_WHEEL_FACTOR = 1.15;

type View = { scale: number; x: number; y: number };

const INITIAL_VIEW: View = { scale: MIN_SCALE, x: 0, y: 0 };

// Pure geometry, no DOM access -- the only part of this file that's honestly
// unit-testable in jsdom (which reports every element as 0x0).
// `offset` is the axis's pan value, `scale` the current zoom, `frame`/`image`
// the frame's and the image's natural size on that axis at scale 1.
export function clampOffset(
  offset: number,
  scale: number,
  frame: number,
  image: number,
): number {
  const scaledImage = image * scale;
  if (scaledImage <= frame) return 0;
  const max = (scaledImage - frame) / 2;
  return Math.min(max, Math.max(-max, offset));
}

// The <img> is `h-full w-full object-contain`, so its *element* box always
// fills the frame while the *painted* image is letterboxed inside it.
// Clamping against clientWidth/clientHeight would let a tall receipt be
// dragged sideways out of view on the letterboxed axis -- exactly what
// clampOffset exists to prevent. This returns the painted size at scale 1.
// Pure, so the contain math is unit-testable even though jsdom has no layout.
export function containedSize(
  frameWidth: number,
  frameHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): { width: number; height: number } {
  if (!naturalWidth || !naturalHeight) return { width: 0, height: 0 };
  const fit = Math.min(frameWidth / naturalWidth, frameHeight / naturalHeight);
  return { width: naturalWidth * fit, height: naturalHeight * fit };
}

function clampView(
  view: View,
  frame: HTMLElement,
  image: HTMLImageElement,
): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale));
  const frameWidth = frame.clientWidth;
  const frameHeight = frame.clientHeight;
  const painted = containedSize(
    frameWidth,
    frameHeight,
    image.naturalWidth,
    image.naturalHeight,
  );
  // Not loaded yet -- nothing to clamp against, leave the offset alone.
  if (!painted.width) return { ...view, scale };

  return {
    scale,
    x: clampOffset(view.x, scale, frameWidth, painted.width),
    y: clampOffset(view.y, scale, frameHeight, painted.height),
  };
}

// Zooms by `factor` anchored on `cursor` (position relative to the frame's
// center; {0, 0} for the toolbar buttons, which have no pointer position).
function zoomAt(view: View, factor: number, cursor: { x: number; y: number }) {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const px = (cursor.x - view.x) / view.scale;
  const py = (cursor.y - view.y) / view.scale;
  return {
    scale,
    x: cursor.x - px * scale,
    y: cursor.y - py * scale,
  };
}

type ReceiptZoomViewProps = {
  src: string;
  alt: string;
};

export function ReceiptZoomView({ src, alt }: ReceiptZoomViewProps) {
  const t = useTranslations("ReceiptFormDialog");
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  function applyClamp(next: View): View {
    const frame = frameRef.current;
    const image = imageRef.current;
    return frame && image ? clampView(next, frame, image) : next;
  }

  // Manual listener, not React's onWheel: React attaches its wheel handler
  // passively at the root, so preventDefault() inside onWheel is silently
  // ignored and the page behind the dialog scrolls too. { scale, x, y } in
  // one state object, updated functionally, is what lets this effect keep an
  // empty dependency array and register the listener exactly once.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = frame!.getBoundingClientRect();
      const cursor = {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      };
      const factor = Math.min(
        MAX_WHEEL_FACTOR,
        Math.max(MIN_WHEEL_FACTOR, 1 - e.deltaY * 0.0015),
      );
      setView((v) => applyClamp(zoomAt(v, factor, cursor)));
    }

    frame.addEventListener("wheel", handleWheel, { passive: false });
    return () => frame.removeEventListener("wheel", handleWheel);
  }, []);

  function handlePointerDown(e: PointerEvent<HTMLImageElement>) {
    // Left button only. Without this, a right-click would start a pan that
    // the context menu then leaves stuck (no pointerup reaches us), and the
    // image would keep following the cursor afterwards.
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: view.x,
      offsetY: view.y,
    };
    setIsDragging(true);
  }

  function handlePointerMove(e: PointerEvent<HTMLImageElement>) {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setView((v) =>
      applyClamp({
        ...v,
        x: dragStart.current.offsetX + dx,
        y: dragStart.current.offsetY + dy,
      }),
    );
  }

  function handlePointerUp() {
    setIsDragging(false);
  }

  function zoomByButton(factor: number) {
    setView((v) => applyClamp(zoomAt(v, factor, { x: 0, y: 0 })));
  }

  function reset() {
    setView(INITIAL_VIEW);
  }

  return (
    <div ref={frameRef} className="relative h-[78vh] w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        // draggable={false} is load-bearing: an <img> is natively draggable,
        // so a left-press starts the browser's own drag-and-drop (ghost
        // image, drop cursor) and swallows the pointermove stream this
        // component needs. select-none stops the same press from starting a
        // text selection in the surrounding dialog.
        draggable={false}
        className={`h-full w-full object-contain select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 bg-background/80 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <HugeiconsIcon icon={MouseScroll01Icon} size={16} />
            {t("zoomHintScroll")}
          </span>
          <span className="flex items-center gap-1.5">
            <HugeiconsIcon icon={Drag01Icon} size={16} />
            {t("zoomHintDrag")}
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => zoomByButton(1 / BUTTON_STEP)}
          >
            <HugeiconsIcon icon={ZoomOutAreaIcon} />
            {t("zoomOutButton")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => zoomByButton(BUTTON_STEP)}
          >
            <HugeiconsIcon icon={ZoomInAreaIcon} />
            {t("zoomInButton")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            <HugeiconsIcon icon={RefreshIcon} />
            {t("resetZoomButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}

type ReceiptZoomDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string | null;
  merchant: string;
};

// Shared by the form dialog and the detail dialog: a second Dialog stacked
// over the caller's own, reusing whatever object URL the caller already
// holds (no second network fetch), sm:max-w-7xl -- it must stay wider than
// either parent dialog (sm:max-w-5xl) to read as a zoom at all.
export function ReceiptZoomDialog({
  open,
  onOpenChange,
  src,
  merchant,
}: ReceiptZoomDialogProps) {
  const t = useTranslations("ReceiptZoomView");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-7xl">
        <DialogTitle className="sr-only">
          {t("zoomTitle", { merchant })}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("zoomDescription")}
        </DialogDescription>
        {open && src && <ReceiptZoomView src={src} alt="" />}
      </DialogContent>
    </Dialog>
  );
}

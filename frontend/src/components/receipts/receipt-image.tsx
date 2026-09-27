"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Pdf01Icon } from "@hugeicons/core-free-icons";

import { Skeleton } from "@/components/ui/skeleton";
import { getReceiptImageObjectUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export const isPdf = (contentType: string) => contentType === "application/pdf";

type ReceiptImageProps = {
  receiptId: string;
  alt: string;
  className?: string;
  // A PDF has no thumbnail worth fetching (no thumbnail endpoint, and a full
  // PDF download per table row would be wasteful) -- show a static icon tile
  // instead and skip the fetch entirely.
  pdf?: boolean;
};

// Shared, ref-counted object-URL cache: the row thumbnail and the hover
// preview both show the same receipt, and there is no thumbnail endpoint, so
// sharing one fetch per receiptId avoids a second full-image download.
// Ownership rule: each mounted ReceiptImage for a receiptId holds exactly one
// reference. The object URL is revoked only when the last such instance
// unmounts, so e.g. a closing hover card never revokes a URL the table row
// is still displaying.
type CacheEntry = {
  promise: Promise<string>;
  refCount: number;
  // Every mounted consumer for this receiptId, notified when the image is
  // replaced (see refreshReceiptImage) -- the cache key is receiptId, which
  // doesn't change across a replace, so a plain delete-and-refetch would
  // leave every already-mounted <img> (e.g. the table row behind an open
  // edit dialog) pointing at the stale, soon-to-be-revoked URL forever.
  listeners: Set<(url: string) => void>;
};
const cache = new Map<string, CacheEntry>();

function acquire(
  receiptId: string,
  onUpdate: (url: string) => void,
): Promise<string> {
  let entry = cache.get(receiptId);
  if (!entry) {
    const promise = getReceiptImageObjectUrl(receiptId).catch((error) => {
      // A failed fetch must not permanently poison this receiptId for the
      // rest of the session — drop the entry so the next mount retries.
      cache.delete(receiptId);
      throw error;
    });
    entry = { promise, refCount: 0, listeners: new Set() };
    cache.set(receiptId, entry);
  }
  entry.refCount += 1;
  entry.listeners.add(onUpdate);
  return entry.promise;
}

function release(receiptId: string, onUpdate: (url: string) => void) {
  const entry = cache.get(receiptId);
  if (!entry) return;
  entry.listeners.delete(onUpdate);
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    cache.delete(receiptId);
    entry.promise.then((url) => URL.revokeObjectURL(url)).catch(() => {});
  }
}

// Call after the receipt's stored image has been replaced server-side.
// Fetches the new bytes once, hands the new URL to every currently mounted
// consumer, and only then revokes the old one -- so nothing ever observes a
// gap where the cache has no valid URL at all. A no-op if nothing has this
// receiptId mounted; the next mount just fetches fresh.
export async function refreshReceiptImage(receiptId: string): Promise<void> {
  const entry = cache.get(receiptId);
  if (!entry) return;

  const oldUrl = await entry.promise.catch(() => null);
  const newUrl = await getReceiptImageObjectUrl(receiptId);

  entry.promise = Promise.resolve(newUrl);
  for (const listener of entry.listeners) listener(newUrl);
  if (oldUrl) URL.revokeObjectURL(oldUrl);
}

// Shared by ReceiptImage and the form dialog's zoom overlay, so both display
// the same cached object URL instead of the overlay triggering a second
// fetch of the same bytes. Pass "" (e.g. no receipt yet, create mode) to
// skip fetching entirely -- there's nothing to load.
export function useReceiptImageUrl(receiptId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    // "" means no receipt yet (e.g. create mode) -- nothing to fetch, and
    // url's initial null state already reflects that.
    if (!receiptId) return;

    let cancelled = false;
    const onUpdate = (updated: string) => {
      if (!cancelled) setUrl(updated);
    };

    acquire(receiptId, onUpdate)
      .then(onUpdate)
      .catch(() => {
        // Caller keeps its own not-loaded fallback on failure.
      });

    return () => {
      cancelled = true;
      release(receiptId, onUpdate);
    };
  }, [receiptId]);

  return url;
}

export function ReceiptImage({
  receiptId,
  alt,
  className,
  pdf,
}: ReceiptImageProps) {
  // "" is useReceiptImageUrl's existing no-op case (no receipt yet) -- reuse
  // it for the pdf tile so this never fetches the full PDF just to skip it.
  const url = useReceiptImageUrl(pdf ? "" : receiptId);

  if (pdf) {
    // Empty alt means decorative (e.g. the hover preview) -- hide it from
    // the accessibility tree entirely instead of announcing an empty label.
    const a11yProps = alt
      ? { role: "img" as const, "aria-label": alt }
      : { "aria-hidden": true as const };
    return (
      <div
        {...a11yProps}
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          className,
        )}
      >
        <HugeiconsIcon icon={Pdf01Icon} />
      </div>
    );
  }

  if (!url) {
    return <Skeleton className={className} />;
  }

  // Blob URLs are client-only and already local, so next/image's remote
  // optimization pipeline doesn't apply here — a plain <img> is correct.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={cn("object-cover", className)} />;
}

// A PDF viewed in a dialog: the browser's native PDF renderer inside an
// iframe. No `sandbox` -- Chrome's built-in PDF viewer doesn't render inside
// a sandboxed iframe, and the source is the user's own authenticated file
// (an object URL from the same cache ReceiptImage/Download use), not
// third-party content. `#toolbar=0` hides Chrome/Edge's viewer toolbar
// (the dialog has its own Download); other viewers ignore it. The viewer's
// scrollbar lives in the plugin's own document -- page CSS can't style it.
export function ReceiptPdfFrame({
  src,
  title,
  className,
}: {
  src: string | null;
  title: string;
  className?: string;
}) {
  if (!src) {
    return <Skeleton className={className} />;
  }
  return (
    <iframe
      src={`${src}#toolbar=0`}
      title={title}
      className={cn("h-full min-h-96 w-full rounded-md border", className)}
    />
  );
}

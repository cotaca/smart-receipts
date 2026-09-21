"use client";

import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { getReceiptImageObjectUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type ReceiptImageProps = {
  receiptId: string;
  alt: string;
  className?: string;
};

// Shared, ref-counted object-URL cache: the row thumbnail and the hover
// preview both show the same receipt, and there is no thumbnail endpoint, so
// sharing one fetch per receiptId avoids a second full-image download.
// Ownership rule: each mounted ReceiptImage for a receiptId holds exactly one
// reference. The object URL is revoked only when the last such instance
// unmounts, so e.g. a closing hover card never revokes a URL the table row
// is still displaying.
type CacheEntry = { promise: Promise<string>; refCount: number };
const cache = new Map<string, CacheEntry>();

function acquire(receiptId: string): Promise<string> {
  let entry = cache.get(receiptId);
  if (!entry) {
    const promise = getReceiptImageObjectUrl(receiptId).catch((error) => {
      // A failed fetch must not permanently poison this receiptId for the
      // rest of the session — drop the entry so the next mount retries.
      cache.delete(receiptId);
      throw error;
    });
    entry = { promise, refCount: 0 };
    cache.set(receiptId, entry);
  }
  entry.refCount += 1;
  return entry.promise;
}

function release(receiptId: string) {
  const entry = cache.get(receiptId);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    cache.delete(receiptId);
    entry.promise.then((url) => URL.revokeObjectURL(url)).catch(() => {});
  }
}

export function ReceiptImage({ receiptId, alt, className }: ReceiptImageProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    acquire(receiptId)
      .then((created) => {
        if (!cancelled) setUrl(created);
      })
      .catch(() => {
        // Skeleton stays visible on failure.
      });

    return () => {
      cancelled = true;
      release(receiptId);
    };
  }, [receiptId]);

  if (!url) {
    return <Skeleton className={className} />;
  }

  // Blob URLs are client-only and already local, so next/image's remote
  // optimization pipeline doesn't apply here — a plain <img> is correct.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={cn("object-cover", className)} />;
}

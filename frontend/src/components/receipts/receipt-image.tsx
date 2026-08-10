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

export function ReceiptImage({ receiptId, alt, className }: ReceiptImageProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    getReceiptImageObjectUrl(receiptId).then((created) => {
      if (cancelled) {
        URL.revokeObjectURL(created);
        return;
      }
      objectUrl = created;
      setUrl(created);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
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

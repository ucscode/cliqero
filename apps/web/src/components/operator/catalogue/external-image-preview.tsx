"use client";

import { useState } from "react";
import { externalListingImageUrl } from "@/modules/listing/external-image";

export function externalImagePreviewStatus(
  url: string,
  loadedUrl: string | null,
  failedUrl: string | null,
) {
  if (!url) return "empty";
  if (failedUrl === url) return "failed";
  if (loadedUrl === url) return "loaded";
  return "loading";
}

export function ExternalImagePreview({ value }: { value: string }) {
  const url = externalListingImageUrl({ external_image_url: value.trim() });
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const status = externalImagePreviewStatus(url ?? "", loadedUrl, failedUrl);

  if (!value.trim()) return null;
  if (!url) return <p className="text-xs text-rose-700">Enter a valid HTTP or HTTPS image URL.</p>;

  return (
    <figure className="grid gap-1">
      <div className="grid h-40 w-full place-items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 sm:h-48">
        {status === "failed" ? (
          <p className="px-3 text-center text-xs text-slate-600">
            Image could not be loaded. The URL is still saved in the field above.
          </p>
        ) : (
          <>
            {status === "loading" && (
              <span className="text-xs text-slate-500">Loading preview…</span>
            )}
            <img
              key={url}
              src={url}
              alt="External listing image preview"
              className="h-full w-full object-contain"
              onLoad={() => setLoadedUrl(url)}
              onError={() => setFailedUrl(url)}
            />
          </>
        )}
      </div>
      <figcaption className="text-xs text-slate-500">External image preview</figcaption>
    </figure>
  );
}

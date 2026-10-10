import type { Listing } from "@/lib/api-client";

const storagePrefix = "cliqero.operator.listing-preview:";
const previewLifetimeMs = 10 * 60 * 1000;

type PreviewDraft = { createdAt: number; listing: Listing };

export function saveCataloguePreviewDraft(
  identity: string,
  listing: Listing,
  storage: Storage = localStorage,
  now = Date.now(),
) {
  pruneCataloguePreviewDrafts(storage, now);
  const value: PreviewDraft = { createdAt: now, listing };
  storage.setItem(`${storagePrefix}${identity}`, JSON.stringify(value));
}

export function takeCataloguePreviewDraft(
  identity: string,
  storage: Storage = localStorage,
  now = Date.now(),
) {
  const key = `${storagePrefix}${identity}`;
  const raw = storage.getItem(key);
  storage.removeItem(key);
  pruneCataloguePreviewDrafts(storage, now);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PreviewDraft>;
    if (
      typeof value.createdAt !== "number" ||
      now - value.createdAt > previewLifetimeMs ||
      !value.listing ||
      typeof value.listing.id !== "string"
    )
      return null;
    return value.listing;
  } catch {
    return null;
  }
}

function pruneCataloguePreviewDrafts(storage: Storage, now: number) {
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (!key?.startsWith(storagePrefix)) continue;
    const raw = storage.getItem(key);
    try {
      const value = raw ? (JSON.parse(raw) as Partial<PreviewDraft>) : null;
      if (
        !value ||
        typeof value.createdAt !== "number" ||
        now - value.createdAt > previewLifetimeMs
      )
        storage.removeItem(key);
    } catch {
      storage.removeItem(key);
    }
  }
}

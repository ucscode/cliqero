import { describe, expect, it } from "vitest";
import {
  saveCataloguePreviewDraft,
  takeCataloguePreviewDraft,
} from "@/components/operator/catalogue/preview-storage";
import type { Listing } from "@/lib/api-client";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("private catalogue preview drafts", () => {
  it("keeps drafts isolated by listing/editor identity and consumes each draft once", () => {
    const storage = new MemoryStorage();
    const first = { id: "listing-first", title: "First draft" } as Listing;
    const second = { id: "listing-second", title: "Second draft" } as Listing;
    saveCataloguePreviewDraft("listing-first", first, storage, 100);
    saveCataloguePreviewDraft("listing-second", second, storage, 100);

    expect(takeCataloguePreviewDraft("listing-first", storage, 101)).toEqual(first);
    expect(takeCataloguePreviewDraft("listing-first", storage, 102)).toBeNull();
    expect(takeCataloguePreviewDraft("listing-second", storage, 102)).toEqual(second);
  });

  it("cleans abandoned and expired drafts on later preview activity", () => {
    const storage = new MemoryStorage();
    const draft = { id: "listing-first", title: "Unsaved" } as Listing;
    saveCataloguePreviewDraft("abandoned", draft, storage, 100);
    expect(takeCataloguePreviewDraft("abandoned", storage, 10 * 60 * 1000 + 101)).toBeNull();
    expect(storage.length).toBe(0);
  });
});

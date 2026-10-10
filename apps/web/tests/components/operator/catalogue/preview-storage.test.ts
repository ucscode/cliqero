import { describe, expect, it } from "vitest";
import {
  discardCataloguePreviewDraft,
  readCataloguePreviewDraft,
  saveCataloguePreviewDraft,
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
  it("keeps editor drafts isolated and available across preview page refreshes", () => {
    const storage = new MemoryStorage();
    const first = {
      id: "listing-first",
      title: "First draft",
      media: [{ id: "blob-1", url: "blob:uploaded-thumbnail" }],
    } as Listing;
    const second = { id: "listing-second", title: "Second draft" } as Listing;
    saveCataloguePreviewDraft("listing-first", first, storage, 100);
    saveCataloguePreviewDraft("listing-second", second, storage, 100);

    expect(readCataloguePreviewDraft("listing-first", storage, 101)).toEqual(first);
    expect(readCataloguePreviewDraft("listing-first", storage, 102)).toEqual(first);
    expect(readCataloguePreviewDraft("listing-second", storage, 102)).toEqual(second);
    discardCataloguePreviewDraft("listing-first", storage);
    expect(readCataloguePreviewDraft("listing-first", storage, 103)).toBeNull();
  });

  it("shows the latest saved editor state each time the named preview is refreshed", () => {
    const storage = new MemoryStorage();
    saveCataloguePreviewDraft(
      "editor-session",
      { id: "preview", title: "First" } as Listing,
      storage,
      100,
    );
    saveCataloguePreviewDraft(
      "editor-session",
      { id: "preview", title: "Latest" } as Listing,
      storage,
      200,
    );

    expect(readCataloguePreviewDraft("editor-session", storage, 201)).toMatchObject({
      title: "Latest",
    });
    expect(readCataloguePreviewDraft("editor-session", storage, 202)).toMatchObject({
      title: "Latest",
    });
  });

  it("cleans abandoned and expired drafts on later preview activity", () => {
    const storage = new MemoryStorage();
    const draft = { id: "listing-first", title: "Unsaved" } as Listing;
    saveCataloguePreviewDraft("abandoned", draft, storage, 100);
    expect(readCataloguePreviewDraft("abandoned", storage, 10 * 60 * 1000 + 101)).toBeNull();
    expect(storage.length).toBe(0);
  });
});

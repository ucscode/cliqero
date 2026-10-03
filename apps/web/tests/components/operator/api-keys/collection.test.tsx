import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CrudCollectionController } from "@/components/crud/collection-controller";
import { OperatorApiKeys } from "@/components/operator/api-keys/collection";
import {
  INITIAL_API_KEY_FILTERS,
  type ApiKeyCollectionFilters,
} from "@/components/operator/api-keys/model";
import { ToastProvider } from "@/components/toast/provider";
import { OperatorConfirmationProvider } from "@/components/operator/ui/confirmation";

describe("Operator API-key collection interactions", () => {
  it("shows the collection and dedicated create link without rendering a create dialog", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <OperatorConfirmationProvider>
          <OperatorApiKeys />
        </OperatorConfirmationProvider>
      </ToastProvider>,
    );
    expect(html).toContain("API keys");
    expect(html).toContain('href="/operator/api-keys/new"');
    expect(html).toContain('type="search"');
    expect(html).toContain("Loading");
    expect(html).not.toContain("DialogContent");
    expect(html).not.toContain("Scopes / permissions");
  });

  it("leaves filter control edits as drafts and fetches only on Apply, Clear, or paging", async () => {
    const readPage = vi.fn(
      async (filters: ApiKeyCollectionFilters, cursor: string | null, size: number) => {
        void filters;
        return { items: [], nextCursor: cursor ?? String(size) };
      },
    );
    const collection = new CrudCollectionController(readPage, INITIAL_API_KEY_FILTERS, 25);
    await collection.initialize(INITIAL_API_KEY_FILTERS);
    expect(readPage).toHaveBeenCalledTimes(1);

    const draft = {
      ...INITIAL_API_KEY_FILTERS,
      search: "automation",
      accountId: "account-1",
      state: "expired" as const,
      sort: "name" as const,
      direction: "asc" as const,
    };
    // Search, select and sort controls only update React draft state; they do not call this reader.
    expect(readPage).toHaveBeenCalledTimes(1);
    await collection.apply(draft);
    expect(readPage).toHaveBeenCalledTimes(2);
    expect(readPage.mock.calls[1][0]).toEqual(draft);
    await collection.next();
    expect(readPage).toHaveBeenCalledTimes(3);
    expect(readPage.mock.calls[2][0]).toEqual(draft);
    expect(readPage.mock.calls[2][1]).toBe("25");
    await collection.apply(INITIAL_API_KEY_FILTERS);
    expect(readPage).toHaveBeenCalledTimes(4);
    expect(readPage.mock.calls[3][0]).toEqual(INITIAL_API_KEY_FILTERS);
    expect(collection.hasPrevious).toBe(false);
  });

  it("keeps collection network reads inside the shared explicit-apply reader", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/operator/api-keys/collection.tsx"),
      "utf8",
    );
    expect(source).toContain("useCrudCollection(readPage, INITIAL_API_KEY_FILTERS)");
    expect(source).toContain("const applied = await collection.apply(next)");
    expect(source).toContain("onChange={(event) => setSearch(event.target.value)}");
    expect(source).toContain("onChange={(event) => setState(event.target.value as typeof state)}");
    expect(source).toContain("onChange={setAccountFilter}");
    expect(source).not.toContain("useEffect(");
    expect(source).toContain('label: "Delete"');
    expect(source).toContain("/internal/api-keys/actions/delete");
  });
});

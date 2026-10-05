import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ container: null as any, account: null as any }));
vi.mock("@/infrastructure/container", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/container")>();
  return { ...actual, getContainer: () => state.container };
});
vi.mock("@/api/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/http")>();
  return { ...actual, authenticatedAccount: async () => state.account };
});

import { createContainer } from "@/infrastructure/container";
import { createApiApp } from "@/api/hono";
import { POST } from "@/api/compat/listings/route";
import { PATCH } from "@/api/compat/listings/[id]/route";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("Operator catalogue editor API contract", () => {
  const app = createContainer(databaseUrl!);

  beforeEach(async () => {
    await app.database.query(`truncate table
      kernel.audit_records,listing_capability.media,listing_capability.listings,
      listing_capability.categories,identity_capability.account_capabilities,
      identity_capability.sessions,identity_capability.accounts restart identity cascade`);
    const account = await app.authentication.register({
      email: "operator-editor@example.test",
      username: "operator_editor",
      password: "correct-horse-battery",
      country: "NG",
    });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [account.id],
    );
    state.container = app;
    state.account = account;
  });

  afterAll(async () => {
    await app.database.close();
    await app.authentication.betterAuth.close();
  });

  it("creates and updates a featured listing with the complete editor payload", async () => {
    const category = await app.listingCategories.create("Editor category", "editor-category");
    const editorPayload = {
      title: "Editor contract listing",
      short_description: "A compact editor summary.",
      long_description: "A **Markdown** description saved from the editor.",
      price_minor: "2500",
      currency: "USD",
      destination: "https://access.example.test/editor-listing",
      compare_at_price_minor: "4000",
      visibility: "authenticated",
      category_ids: [category.id],
      featured_position: 2,
      state: "published",
    };
    const createdResponse = await POST(
      new Request("http://localhost/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editorPayload),
      }),
    );
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created).toMatchObject({
      title: editorPayload.title,
      short_description: editorPayload.short_description,
      long_description: editorPayload.long_description,
      price: { minor_amount: "2500", currency: "USD" },
      compare_at_price: { minor_amount: "4000", currency: "USD" },
      destination: editorPayload.destination,
      visibility: editorPayload.visibility,
      featured_position: 2,
      state: "published",
      categories: [{ id: category.id }],
    });

    const updatePayload = {
      ...editorPayload,
      title: "Updated featured listing",
      short_description: "The updated compact summary.",
      long_description: "Updated **Markdown** description.",
      price_minor: "2700",
      compare_at_price_minor: "4500",
      destination: "https://access.example.test/updated-listing",
      visibility: "public",
      category_ids: [],
      featured_position: 3,
      state: "archived",
    };
    const updatedResponse = await PATCH(
      new Request(`http://localhost/api/listings/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updatePayload),
      }),
      { params: Promise.resolve({ listingId: created.id }) },
    );
    expect(updatedResponse.status).toBe(200);
    expect(await updatedResponse.json()).toMatchObject({
      id: created.id,
      title: updatePayload.title,
      short_description: updatePayload.short_description,
      long_description: updatePayload.long_description,
      price: { minor_amount: "2700", currency: "USD" },
      compare_at_price: { minor_amount: "4500", currency: "USD" },
      destination: updatePayload.destination,
      visibility: updatePayload.visibility,
      featured_position: 3,
      state: "archived",
      categories: [],
      media: [],
    });
    expect(await app.listingService.get(created.id)).toMatchObject({
      featuredPosition: 3,
      state: "archived",
    });
  });

  it("returns useful client errors and supports category create/edit/delete over the API", async () => {
    const api = createApiApp({
      ...app,
      principalResolver: {
        resolve: async () => ({
          kind: "user_session" as const,
          accountId: state.account.id,
          account: state.account,
          capabilities: ["system.root"],
          scopes: new Set<string>(),
        }),
      },
    } as any);
    const post = (body: unknown) =>
      api.fetch(
        new Request("http://localhost/api/catalogue/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    const generated = await post({ name: "Generated Route Category" });
    expect(generated.status).toBe(201);
    const generatedCategory = await generated.json();
    expect(generatedCategory.slug).toBe("generated-route-category");

    const explicit = await post({ name: "Explicit Route Category", slug: "explicit-route" });
    expect(explicit.status).toBe(201);
    const explicitCategory = await explicit.json();

    const duplicateName = await post({ name: "Generated Route Category" });
    expect(duplicateName.status).toBe(409);
    expect(await duplicateName.json()).toMatchObject({ code: "category_name_conflict" });
    const duplicateSlug = await post({ name: "Another Route Category", slug: "explicit-route" });
    expect(duplicateSlug.status).toBe(409);
    expect(await duplicateSlug.json()).toMatchObject({ code: "category_slug_conflict" });

    const updated = await api.fetch(
      new Request(`http://localhost/api/catalogue/categories/${explicitCategory.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Edited Route Category", slug: "edited-route" }),
      }),
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      name: "Edited Route Category",
      slug: "edited-route",
    });

    const removed = await api.fetch(
      new Request("http://localhost/api/catalogue/categories", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [explicitCategory.id, generatedCategory.id] }),
      }),
    );
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({
      results: [
        { id: explicitCategory.id, deleted: true, error: null },
        { id: generatedCategory.id, deleted: true, error: null },
      ],
    });
  });
});

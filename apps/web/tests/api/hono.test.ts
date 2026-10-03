import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "@/api/hono";
import { swaggerUiResponse } from "@/api/openapi/swagger-ui";
import { BlogCategoryConflictError } from "@/modules/blog/domain/blog";
import {
  authorizeLegacyRequest,
  getLegacyRouteAccess,
  legacyApiPaths,
} from "@/api/legacy-dispatch";
import { legacyRoutes } from "@/api/compat/dispatch/routes";
import { authenticatedAccount, authenticatedPrincipal } from "@/api/http";

function appWith(
  principal: any = null,
  schemaAccess: { environment: string | undefined; key: string | null } = {
    environment: "development",
    key: null,
  },
  hierarchySearch: (...args: any[]) => Promise<unknown[]> = async () => [],
  blogOverrides: Record<string, unknown> = {},
  categoryOverrides: Record<string, unknown> = {},
  reviewOverrides: Record<string, unknown> = {},
  principalResolverOverride?: { resolve: (request: Request) => Promise<any> },
  withdrawalOverrides: Record<string, unknown> = {},
) {
  const ordinaryId = "00000000-0000-4000-8000-000000000001";
  const resolvedPrincipal = principal ?? {
    kind: "anonymous",
    accountId: null,
    account: null,
    capabilities: [],
    scopes: new Set<string>(),
  };
  return createApiApp(
    {
      principalResolver: principalResolverOverride ?? { resolve: async () => resolvedPrincipal },
      profiles: {
        get: async () => ({
          email: "operator@example.com",
          username: "system.root",
          displayName: null,
          country: null,
        }),
        update: async () => ({}),
      },
      hierarchy: {
        tree: async () => ({
          root: "00000000-0000-4000-8000-000000000001",
          windowDepth: 3,
          childLimit: 50,
          parent: null,
          nodes: [],
          edges: [],
        }),
        descendants: async () => ({ items: [], nextCursor: null }),
        availableLevels: async () => ({ levels: [] }),
        search: hierarchySearch,
      },
      apiKeys: { create: async () => ({}), list: async () => [], revoke: async () => {} },
      operatorApiKeys: {
        list: async () => ({ items: [], manageableScopes: [] }),
        listAll: async () => ({ items: [], manageableScopes: [] }),
        get: async () => ({ id: ordinaryId }),
        create: async () => ({
          id: "00000000-0000-4000-8000-000000000005",
          secret: "cliq_live_test",
          name: "test",
          scopes: [],
          keyPrefix: "cliq_live_test",
          createdAt: new Date(),
          expiresAt: null,
        }),
        update: async () => ({ id: ordinaryId }),
        revoke: async () => ({ changed: true, key: null }),
      },
      operatorOverview: {
        get: async (capabilities: readonly string[]) => ({
          capabilities,
          catalogue: { published: 4, draft: 1, archived: 2 },
          ...(capabilities.includes("system.root")
            ? {
                users: { total: 9 },
                commerce: { purchases: 6 },
                withdrawals: { requested: 1, approved: 2 },
              }
            : {}),
        }),
      },
      operatorAccounts: {
        list: async () => ({ items: [], nextCursor: null }),
        get: async (id: string) => ({
          id,
          username: "sample",
          displayName: null,
          email: "sample@example.com",
          country: null,
          createdAt: new Date().toISOString(),
          deletedAt: null,
          directReferralCount: 0,
          parent: null,
          purchaseCount: 0,
          latestParentReassignment: null,
        }),
      },
      operatorAccountManagement: {
        create: async (_actorId: string, input: any) => ({
          account: {
            id: "00000000-0000-4000-8000-000000000006",
            username: input.username,
            displayName: null,
            email: input.email,
            country: input.country ?? null,
            createdAt: new Date().toISOString(),
            deletedAt: null,
            directReferralCount: 0,
            parent: null,
            purchaseCount: 0,
            latestParentReassignment: null,
          },
          credentialSetupMode: input.credentialSetup?.mode ?? "email",
          passwordSetupEmailRequested: true,
        }),
        update: async (_actorId: string, accountId: string, input: any) => ({
          id: accountId,
          username: input.username ?? "sample",
          displayName: null,
          email: "sample@example.com",
          country: input.country ?? null,
          createdAt: new Date().toISOString(),
          deletedAt: null,
          directReferralCount: 0,
          parent: null,
          purchaseCount: 0,
          latestParentReassignment: null,
        }),
        delete: async () => undefined,
      },
      capabilityAdministration: {
        inspect: async (_actorId: string, accountId: string) => ({
          accountId,
          assignments: [],
          manageableCapabilities: [],
          isSelf: false,
        }),
        grant: async (_actorId: string, accountId: string, capability: string) => ({
          accountId,
          capability,
          changed: true,
          assigned: true,
          grantedAt: new Date().toISOString(),
        }),
        revoke: async (_actorId: string, accountId: string, capability: string) => ({
          accountId,
          capability,
          changed: true,
          assigned: false,
          grantedAt: null,
        }),
      },
      operatorFunding: {
        list: async () => ({ items: [], nextCursor: null }),
        get: async (id: string) => ({
          id,
          account: {
            id: "00000000-0000-4000-8000-000000000001",
            username: "sample",
            email: "sample@example.com",
          },
          provider: "development",
          providerReference: "dev-reference",
          canonicalAmountMinor: "100",
          canonicalCurrency: "USD",
          collectionAmountMinor: "100",
          collectionCurrency: "USD",
          state: "confirmed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
          walletCredit: null,
          conversionSnapshot: null,
          providerInitialization: null,
          operations: [],
          events: [],
          evidence: null,
        }),
        confirmBankTransfer: async (_actorId: string, id: string) => ({
          id,
          state: "confirmed" as const,
          confirmedAt: new Date().toISOString(),
        }),
      },
      operatorPayments: {
        list: async () => ({ items: [], nextCursor: null }),
        get: async () => ({ id: ordinaryId }),
        events: async (_actorId: string, input: any) => [
          { provider: input.provider ?? "paystack" },
        ],
      },
      paymentReconciliation: {
        eligible: async () => [],
        reconcile: async (input: any) => ({ paymentId: input.paymentId, state: "completed" }),
      },
      operatorDistributions: {
        list: async () => ({ items: [], nextCursor: null }),
        get: async (id: string) => ({
          id,
          purchaseId: "00000000-0000-4000-8000-000000000002",
          listingId: "00000000-0000-4000-8000-000000000003",
          listingTitle: "Sample",
          buyer: { id: ordinaryId, username: "buyer", email: "buyer@example.com" },
          grossAmountMinor: "100",
          currency: "USD",
          referralAllocatedMinor: "0",
          platformRemainderMinor: "100",
          beneficiaryCount: 0,
          completedAt: new Date().toISOString(),
          purchaseState: "completed",
          purchaseCreatedAt: new Date().toISOString(),
          attribution: { id: null, referrer: null },
          policySnapshot: {},
          allocations: [],
          reversal: null,
        }),
      },
      operatorEarnings: {
        list: async () => ({
          items: [],
          nextCursor: null,
          totals: { pendingMinor: "0", availableMinor: "0", reservedMinor: "0" },
        }),
      },
      operatorWithdrawals: {
        list: async () => ({ items: [], nextCursor: null }),
        get: async () => ({ items: [] }),
      },
      operatorTreasury: {
        summary: async () => ({
          balanceMinor: "0",
          creditsMinor: "0",
          debitsMinor: "0",
          currency: "USD",
        }),
        list: async () => ({ items: [], nextCursor: null }),
        createManual: async (input: any) => ({
          id: "00000000-0000-4000-8000-000000000004",
          direction: input.direction,
          amountMinor: input.amountMinor,
          title: input.title.trim(),
          note: input.note ?? null,
          sourceKind: null,
          sourceId: null,
          actorId: input.actorId,
          createdAt: new Date(),
        }),
        get: async () => ({
          id: "00000000-0000-4000-8000-000000000004",
          direction: "credit",
          amountMinor: "100",
          title: "Sample",
          note: null,
          source: null,
          actor: null,
          createdAt: new Date().toISOString(),
        }),
      },
      treasury: {
        createManual: async (input: any) => ({
          id: "00000000-0000-4000-8000-000000000004",
          direction: input.direction,
          amountMinor: input.amountMinor,
          title: input.title.trim(),
          note: input.note ?? null,
          sourceKind: null,
          sourceId: null,
          actorId: input.actorId,
          createdAt: new Date(),
        }),
      },
      withdrawals: {
        list: async () => ({ items: [], nextCursor: null }),
        update: async (_actorId: string, _id: string, input: unknown) => ({ input }),
        cancel: async () => ({}),
        complete: async (_actorId: string, id: string, input: unknown) => ({ id, input }),
        ...withdrawalOverrides,
      },
      fundsReservation: {
        summarize: async () => [],
        available: async () => 0n,
      },
      withdrawalPolicy: {
        getActive: async () => ({
          minimumAmount: { minorAmount: 100n, currency: "USD" },
          maximumAmount: null,
        }),
      },
      listingReviews: {
        visible: async () => ({ items: [], nextCursor: null }),
        mine: async () => null,
        create: async () => ({}),
        summariesForListings: async () => new Map(),
        operatorQueue: async () => ({ items: [], nextCursor: null }),
        update: async () => ({}),
        ...reviewOverrides,
      },
      listingService: {
        queryCatalogue: async () => ({ items: [], nextCursor: null }),
        queryStorefront: async () => ({ items: [], nextCursor: null }),
        getOwner: async (_account: unknown, id: string) => ({ id }),
        get: async (id: string) => ({ id }),
        update: vi.fn(async (_account: unknown, _id: string, input: { state: string }) => ({
          state: input.state,
        })),
      },
      integrations: { listForListing: async () => [] },
      listingMediaRepository: { listByListings: async () => new Map() },
      listingCategories: {
        list: async () => [],
        get: async (id: string) => ({ id, name: "Toolkit", slug: "toolkit" }),
        create: async (name: string, slug?: string) => ({
          id: "00000000-0000-4000-8000-000000000009",
          name,
          slug: slug || "toolkit",
        }),
        update: async (id: string, input: Record<string, string>) => ({
          id,
          name: input.name ?? "Toolkit",
          slug: input.slug ?? "toolkit",
        }),
        delete: async () => {},
        ...categoryOverrides,
      },
      blog: {
        list: () => ({ items: [], nextCursor: null, limit: 25 }),
        get: () => null,
        categories: () => [],
        tags: () => [],
        create: () => ({}),
        save: () => ({}),
        createPreview: () => ({
          id: "00000000-0000-4000-8000-000000000099",
          url: "/blog/preview/00000000-0000-4000-8000-000000000099",
        }),
        deletePreview: () => {},
        delete: () => {},
        categoryService: {
          create: (name: string) => ({
            id: "00000000-0000-4000-8000-000000000009",
            name,
            slug: "sample",
          }),
          get: (id: string) => ({ id, name: "Sample", slug: "sample" }),
          update: (id: string, input: Record<string, string>) => ({
            id,
            name: input.name ?? "Sample",
            slug: input.slug ?? "sample",
          }),
          delete: () => {},
          deleteForRoot: () => {},
          ...((blogOverrides.categoryService as object | undefined) ?? {}),
        },
        ...blogOverrides,
      },
    } as any,
    schemaAccess,
  );
}
describe("Hono API foundation", () => {
  it("resolves one principal per Hono request across native and compatibility routes", async () => {
    const session = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: { id: "00000000-0000-4000-8000-000000000001" },
      kind: "user_session" as const,
      capabilities: ["catalogue.manage", "accounts.read", "finance.read"],
      scopes: new Set<string>(),
    };
    const cases = [
      ["compat listing collection", "/api/listings?state=all"],
      [
        "compat listing integrations",
        "/api/listings/00000000-0000-4000-8000-000000000003/integrations",
      ],
      ["account collection", "/api/accounts"],
      ["payments collection", "/api/payments"],
      ["withdrawal collection", "/api/withdrawals"],
    ] as const;

    for (const [label, path] of cases) {
      const resolve = vi.fn(async () => session);
      const response = await appWith(
        session,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { resolve },
      ).fetch(new Request(`http://localhost${path}`));
      expect(response.status, label).toBe(200);
      expect(resolve, label).toHaveBeenCalledTimes(1);
    }
  });

  it("preserves listing-owner and catalogue-manager integration access", async () => {
    const listingId = "00000000-0000-4000-8000-000000000003";
    const path = `http://localhost/api/listings/${listingId}/integrations`;
    const owner = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: { id: "00000000-0000-4000-8000-000000000001" },
      kind: "user_session" as const,
      capabilities: [],
      scopes: new Set<string>(),
    };
    const ownerResolve = vi.fn(async () => owner);
    const ownerResponse = await appWith(
      owner,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { resolve: ownerResolve },
    ).fetch(new Request(path));
    expect(ownerResponse.status).toBe(200);
    expect(await ownerResponse.json()).toEqual({ items: [] });
    expect(ownerResolve).toHaveBeenCalledTimes(1);

    const manager = { ...owner, capabilities: ["catalogue.manage"] };
    const managerResolve = vi.fn(async () => manager);
    const managerResponse = await appWith(
      manager,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { resolve: managerResolve },
    ).fetch(new Request(path));
    expect(managerResponse.status).toBe(200);
    expect(await managerResponse.json()).toEqual({ items: [] });
    expect(managerResolve).toHaveBeenCalledTimes(1);
  });

  it("passes the middleware-resolved principal into compatibility handlers", async () => {
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: { id: "00000000-0000-4000-8000-000000000001" },
      kind: "user_session" as const,
      capabilities: [],
      scopes: new Set<string>(),
    };
    const route = {
      pattern: "/api/test/principal-context",
      module: {
        GET: async (request: Request) => {
          const resolved = await authenticatedPrincipal(request);
          const account = await authenticatedAccount(request);
          return Response.json({
            accountId: resolved.accountId,
            authenticatedAccountId: account?.id,
          });
        },
      },
    };
    const resolve = vi.fn(async () => principal);
    legacyRoutes.push(route);
    try {
      const response = await appWith(
        principal,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { resolve },
      ).fetch(new Request("http://localhost/api/test/principal-context"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        accountId: principal.accountId,
        authenticatedAccountId: principal.accountId,
      });
      expect(resolve).toHaveBeenCalledTimes(1);
    } finally {
      legacyRoutes.splice(legacyRoutes.indexOf(route), 1);
    }
  });

  it("exposes reconciliation through the provider-neutral payment API", async () => {
    const operator = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: { id: "00000000-0000-4000-8000-000000000001" },
      kind: "user_session",
      capabilities: ["finance.manage", "finance.read"],
      scopes: new Set<string>(),
    };
    const response = await appWith(operator).fetch(
      new Request("http://localhost/api/payments/00000000-0000-4000-8000-000000000099/reconcile", {
        method: "POST",
        headers: { "idempotency-key": "manual-reconcile-test" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      attempt: { paymentId: "00000000-0000-4000-8000-000000000099", state: "completed" },
    });

    const apiKey = { ...operator, kind: "api_key" as const };
    const paymentsPath = "http://localhost/api/payments";
    expect(
      (await appWith({ ...apiKey, scopes: new Set<string>() }).fetch(new Request(paymentsPath)))
        .status,
    ).toBe(403);
    expect(
      (
        await appWith({ ...apiKey, scopes: new Set(["payments:read"]) }).fetch(
          new Request(paymentsPath),
        )
      ).status,
    ).toBe(200);
  });

  it("keeps catalogue category reads public and protects mutations with capability and scope", async () => {
    const path = "http://localhost/api/catalogue/categories";
    expect((await appWith().fetch(new Request(path))).status).toBe(200);
    const ordinary = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: { id: "00000000-0000-4000-8000-000000000001" },
      kind: "user_session",
      capabilities: [],
      scopes: new Set<string>(),
    };
    const mutation = (origin: string) =>
      new Request(origin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Toolkit", slug: "toolkit" }),
      });
    expect((await appWith(ordinary).fetch(mutation(path))).status).toBe(403);
    const manager = { ...ordinary, capabilities: ["catalogue.manage"] };
    expect((await appWith(manager).fetch(new Request(path))).status).toBe(200);
    const created = await appWith(manager).fetch(mutation(path));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ name: "Toolkit", slug: "toolkit" });
  });

  it("keeps public blog reads open and blog administration capability/scope constrained", async () => {
    const publicResponse = await appWith().fetch(new Request("http://localhost/api/blog/posts"));
    expect(publicResponse.status).toBe(200);
    const catalogue = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session",
      capabilities: ["catalogue.manage"],
      scopes: new Set<string>(),
    };
    expect(
      (await appWith(catalogue).fetch(new Request("http://localhost/api/blog/posts?status=draft")))
        .status,
    ).toBe(403);
    const operator = {
      ...catalogue,
      capabilities: ["system.root"],
      kind: "api_key",
      scopes: new Set(["blog:read"]),
    };
    expect(
      (await appWith(operator).fetch(new Request("http://localhost/api/blog/posts?status=all")))
        .status,
    ).toBe(200);
    const oversizedPage = await appWith(operator).fetch(
      new Request("http://localhost/api/blog/posts?status=all&limit=500000"),
    );
    expect(oversizedPage.status).toBe(400);
  });
  it("enforces site CRUD maxRows and exposes no UI-only bulk API routes", async () => {
    const base = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: { id: "00000000-0000-4000-8000-000000000001" },
      kind: "user_session" as const,
      capabilities: ["system.root"],
      scopes: new Set<string>(),
    };
    const oversized = await appWith(base).fetch(
      new Request("http://localhost/api/accounts?limit=500000"),
    );
    expect(oversized.status).toBe(400);

    const app = appWith(base);
    const document = await (
      await app.fetch(new Request("http://localhost/api/openapi.json"))
    ).json();
    for (const path of Object.keys(document.paths))
      expect(
        path,
        `stable API route ${path} must not expose an Operator bulk endpoint`,
      ).not.toMatch(/^\/api\/operator\/.*\/bulk$/);
    for (const path of [
      "/api/accounts/bulk",
      "/api/blog/posts/bulk",
      "/api/blog/categories/bulk",
      "/api/catalogue/bulk",
      "/api/catalogue/categories/bulk",
    ])
      expect(document.paths).not.toHaveProperty(path);

    for (const path of [
      "/api/accounts/bulk",
      "/api/blog/posts/bulk",
      "/api/blog/categories/bulk",
      "/api/catalogue/bulk",
      "/api/catalogue/categories/bulk",
    ]) {
      const response = await app.fetch(
        new Request(`http://localhost${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "delete", ids: [] }),
        }),
      );
      expect(response.status).toBe(404);
    }
  });
  it("keeps canonical category deletion and review moderation resource-scoped", async () => {
    const root = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: { id: "00000000-0000-4000-8000-000000000001" },
      kind: "user_session" as const,
      capabilities: ["catalogue.manage", "content.manage"],
      scopes: new Set<string>(),
    };
    const reviewId = "00000000-0000-4000-8000-000000000012";
    const update = vi.fn(async (_account: unknown, id: string, input: { status: string }) => ({
      id,
      status: input.status,
      body: "Review",
      rating: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
      listingId: "00000000-0000-4000-8000-000000000013",
      accountId: "00000000-0000-4000-8000-000000000014",
    }));
    const response = await appWith(
      { ...root, capabilities: ["reviews.moderate"] },
      undefined,
      undefined,
      undefined,
      undefined,
      { update },
    ).fetch(
      new Request(`http://localhost/api/reviews/${reviewId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(root.account, reviewId, { status: "approved" });
    const actionRoute = await appWith(root).fetch(
      new Request(`http://localhost/api/reviews/${reviewId}/approve`, { method: "POST" }),
    );
    expect(actionRoute.status).toBe(404);
  });
  it("returns the same canonical post shape from public and operator Blog APIs", async () => {
    const post = {
      id: "00000000-0000-4000-8000-000000000011",
      slug: "live-post",
      title: "Published version",
      excerpt: "Public excerpt",
      content: "Public Markdown",
      status: "published",
      featuredImageUrl: null,
      authorAccountId: null,
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      publishedAt: new Date("2025-01-01T00:00:00.000Z"),
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      categories: [{ id: "00000000-0000-4000-8000-000000000012", slug: "guides", name: "Guides" }],
      tags: [],
    };
    const overrides = { list: () => ({ items: [post], nextCursor: null, limit: 25 }) };
    const publicResponse = await appWith(null, undefined, undefined, overrides).fetch(
      new Request("http://localhost/api/blog/posts"),
    );
    const publicPost = (await publicResponse.json()).items[0];
    expect(publicPost.title).toBe("Published version");
    expect(publicPost.status).toBe("published");
    expect(publicPost.categories).toHaveLength(1);

    const operator = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session",
      capabilities: ["content.manage"],
      scopes: new Set<string>(),
    };
    const operatorResponse = await appWith(operator, undefined, undefined, overrides).fetch(
      new Request("http://localhost/api/blog/posts?status=all"),
    );
    expect((await operatorResponse.json()).items[0]).toEqual(publicPost);
  });
  it("creates current-form previews only for authenticated content-managing sessions", async () => {
    const user = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session",
      capabilities: ["content.manage"],
      scopes: new Set<string>(),
    };
    expect(
      (await appWith().fetch(new Request("http://localhost/api/blog/categories"))).status,
    ).toBe(200);
    const categories = await appWith(user).fetch(
      new Request("http://localhost/api/blog/categories"),
    );
    expect(categories.status).toBe(200);
    const createPreview = vi.fn((_input, _accountId, previewId) => ({
      id: previewId ?? "00000000-0000-4000-8000-000000000099",
      url: `/blog/preview/${previewId ?? "00000000-0000-4000-8000-000000000099"}`,
    }));
    const body = {
      title: "Unsaved",
      excerpt: "Preview",
      content: "## Current",
      status: "draft",
      category_ids: [],
      tags: [],
    };
    const previewApp = appWith(user, undefined, undefined, { createPreview });
    const preview = await previewApp.fetch(
      new Request("http://localhost/api/blog/previews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    expect(preview.status).toBe(200);
    const payload = await preview.json();
    expect(payload).toMatchObject({
      previewId: "00000000-0000-4000-8000-000000000099",
      url: "/blog/preview/00000000-0000-4000-8000-000000000099",
    });
    expect(payload.url).not.toContain("?");
    const updated = await previewApp.fetch(
      new Request("http://localhost/api/blog/previews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, preview_id: payload.previewId, title: "Changed unsaved" }),
      }),
    );
    expect((await updated.json()).previewId).toBe(payload.previewId);
    expect(createPreview.mock.calls[1]?.[2]).toBe(payload.previewId);
    expect(
      (
        await appWith().fetch(
          new Request("http://localhost/api/blog/previews", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await appWith({ ...user, kind: "api_key" }).fetch(
          new Request("http://localhost/api/blog/previews", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("validates category slugs and reports duplicate names/slugs as stable conflicts", async () => {
    const user = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session",
      capabilities: ["content.manage"],
      scopes: new Set<string>(),
    };
    const invalid = await appWith(user).fetch(
      new Request("http://localhost/api/blog/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Guides", slug: "Bad slug" }),
      }),
    );
    expect(invalid.status).toBe(400);
    const invalidPayload = await invalid.json();
    expect(invalidPayload).toMatchObject({ code: "validation_error" });
    expect(typeof invalidPayload.error).toBe("string");

    for (const field of ["name", "slug"] as const) {
      const duplicate = await appWith(user, undefined, undefined, {
        categoryService: {
          create: () => {
            throw new BlogCategoryConflictError(field);
          },
        },
      }).fetch(
        new Request("http://localhost/api/blog/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Guides", slug: "guides" }),
        }),
      );
      expect(duplicate.status).toBe(409);
      expect(await duplicate.json()).toMatchObject({ code: `category_${field}_conflict` });
    }
  });
  it("serves an OpenAPI document", async () => {
    const response = await appWith().fetch(new Request("http://localhost/api/openapi.json"));
    expect(response.status).toBe(200);
    const document = await response.json();
    const paths = document.paths as Record<string, Record<string, any>>;
    expect(document.components.securitySchemes.CliqeroApiKey).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "Cliqero API Key",
    });
    expect(paths["/api/hierarchy/tree"]).toBeDefined();
    expect(paths["/api/hierarchy/levels"]).toBeDefined();
    expect(paths["/api/hierarchy/descendants"]).toBeDefined();
    expect(paths["/api/hierarchy/children/{parentId}"]).toBeDefined();
    expect(paths["/api/listings"]).toBeDefined();
    expect(paths["/api/wallet"]).toBeDefined();
    expect(paths["/api/openapi.json"]).toBeUndefined();
    expect(paths["/api/wallet/fund/{fundingId}/transaction"].post).toMatchObject({
      "x-authentication-mode": "account",
      "x-required-api-scope": "wallet:fund",
      security: [{ CliqeroApiKey: [] }],
    });
    expect(paths["/api/wallet/fund/{fundingId}/transaction"].post.description ?? "").not.toContain(
      "Authentication:",
    );
    expect(paths["/api/treasury/entries"]).toBeDefined();
    expect(paths["/api/api-keys"]).toBeUndefined();
    expect(paths["/internal/api-keys"]).toBeUndefined();
    expect(paths["/internal/api-keys/{apiKeyId}"]).toBeUndefined();
    expect(paths["/api/accounts/{accountId}/api-keys"]).toBeUndefined();
    expect(paths["/api/accounts/{accountId}/api-keys/{apiKeyId}/revoke"]).toBeUndefined();
    expect(paths["/api/api-keys/{apiKeyId}/revoke"]).toBeUndefined();
    expect(paths["/api/me/access"]).toBeDefined();
    expect(paths["/api/me/session"]).toBeDefined();
    expect(paths["/api/overview"]).toBeDefined();
    expect(paths["/api/accounts"]).toBeDefined();
    expect(paths["/api/accounts"].get).toBeDefined();
    expect(paths["/api/accounts"].post).toBeDefined();
    expect(paths["/api/accounts/{accountId}"].get).toBeDefined();
    expect(paths["/api/accounts/{accountId}"].patch).toBeDefined();
    expect(paths["/api/accounts/{accountId}"].delete).toBeDefined();
    expect(paths["/api/accounts/bulk"]).toBeUndefined();
    expect(paths["/api/payments"].get.tags).toEqual(["Payments"]);
    expect(paths["/api/payments/{paymentId}/reconcile"].post).toBeDefined();
    expect(paths["/api/payments/events"].get).toBeDefined();
    expect(Object.keys(paths).filter((path) => path.startsWith("/api/operator/"))).toEqual([]);
    const internalOnlyApi = await appWith().fetch(
      new Request("http://localhost/api/operator/purchases"),
    );
    expect(internalOnlyApi.status).toBe(404);
    expect(paths).not.toHaveProperty("/api/payments/{provider}/ipn");
    expect(paths["/api/accounts"].post).toMatchObject({
      "x-authentication-mode": "mixed",
      "x-public-access": true,
      "x-required-api-scope": "accounts:manage",
      security: [{ CliqeroApiKey: [] }],
      requestBody: expect.any(Object),
    });
    expect(paths["/api/accounts/{accountId}"]).toMatchObject({
      get: expect.any(Object),
      patch: {
        "x-authentication-mode": "account",
        "x-required-api-scope": "accounts:manage",
        security: [{ CliqeroApiKey: [] }],
        requestBody: expect.any(Object),
        responses: expect.objectContaining({
          "400": expect.any(Object),
          "401": expect.any(Object),
          "403": expect.any(Object),
          "404": expect.any(Object),
          "409": expect.any(Object),
        }),
      },
    });
    expect(paths["/api/accounts/{accountId}/capabilities"]).toMatchObject({
      get: expect.any(Object),
      post: expect.any(Object),
    });
    expect(paths["/api/accounts/{accountId}/capabilities/{capability}"]).toMatchObject({
      delete: expect.any(Object),
    });
    expect(paths["/api/funding"]).toBeDefined();
    expect(paths["/api/funding/{fundingId}"]).toBeDefined();
    expect(paths["/api/funding/{fundingId}/confirm-bank-transfer"]).toBeDefined();
    expect(paths["/api/listings"]).toBeDefined();
    expect(paths["/api/listings/{listingId}"]).toBeDefined();
    expect(paths["/api/listings/{listingId}"].patch).toBeDefined();
    expect(paths["/api/listings/{listingId}/publish"]).toBeUndefined();
    expect(paths["/api/listings/{listingId}/restore"]).toBeUndefined();
    expect(paths["/api/listings/{listingId}/integrations"]).toBeDefined();
    expect(paths["/api/listings/{listingId}/integrations/{integrationId}/rotate"]).toBeDefined();
    expect(paths["/api/listings/{listingId}/integrations"].get.tags).toEqual(["Integrations"]);
    expect(paths["/api/listings/{listingId}/integrations"].post).toBeDefined();
    const createIntegrationSchema =
      paths["/api/listings/{listingId}/integrations"].post.requestBody.content["application/json"]
        .schema;
    expect(createIntegrationSchema.properties).toHaveProperty("name");
    expect(createIntegrationSchema.properties).not.toHaveProperty("listing_id");
    expect(paths["/api/listings/{listingId}/integrations"].get.parameters[0].description).toContain(
      "listing",
    );
    expect(paths["/api/listings/{listingId}/integrations/{integrationId}"].patch).toBeDefined();
    expect(paths["/api/blog/posts/{postId}"]).toMatchObject({
      get: expect.any(Object),
      patch: expect.any(Object),
      delete: expect.any(Object),
    });
    expect(paths["/api/withdrawals/{withdrawalId}"]).toMatchObject({
      get: expect.any(Object),
      patch: expect.any(Object),
    });
    expect(paths["/api/treasury/entries/{entryId}"].get).toBeDefined();
    expect(paths["/api/catalogue/categories/{categoryId}"]).toBeDefined();
    expect(paths["/api/package/entitlements/{entitlementId}"]).toBeDefined();
    const normalizedPath = (path: string) => path.replace(/\{[^}]+\}/g, "{}");
    const normalizedPaths = Object.keys(paths).map(normalizedPath);
    expect(normalizedPaths).toHaveLength(new Set(normalizedPaths).size);
    for (const [path, operations] of Object.entries(paths)) {
      const expected = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      for (const operation of Object.values(operations)) {
        const actual = ((operation.parameters ?? []) as { in: string; name: string }[])
          .filter((parameter) => parameter.in === "path")
          .map((parameter) => parameter.name)
          .sort();
        expect(actual, `path parameter names for ${path}`).toEqual([...expected].sort());
      }
    }
    expect(
      paths["/api/listings/{listingId}/integrations/{integrationId}/rotate"].post,
    ).toBeDefined();
    expect(paths["/api/integrations"]).toBeUndefined();
    expect(paths["/api/overview"].get["x-authentication-mode"]).toBe("account");
    expect(paths["/api/accounts"].get).toMatchObject({
      "x-authentication-mode": "account",
      "x-required-api-scope": "accounts:read",
    });
    expect(paths["/api/funding"].get).toMatchObject({
      "x-authentication-mode": "account",
      "x-required-api-scope": "payments:read",
    });
    expect(paths["/api/distributions"].get).toMatchObject({
      "x-authentication-mode": "account",
      "x-required-api-scope": "payments:read",
    });
    expect(paths["/api/distributions/{distributionId}"].get).toBeDefined();
    expect(paths["/api/earnings/entries"].get).toMatchObject({
      "x-authentication-mode": "account",
      "x-required-api-scope": "payments:read",
    });
    expect(paths["/api/withdrawals"].get).toMatchObject({
      "x-authentication-mode": "account",
      "x-required-api-scope": "withdrawals:manage",
    });
    expect(paths["/api/withdrawals/{withdrawalId}"].patch).toMatchObject({
      "x-authentication-mode": "account",
      "x-required-api-scope": "withdrawals:manage",
    });
    expect(paths["/api/withdrawals/{withdrawalId}/approve"]).toBeUndefined();
    expect(paths["/api/withdrawals/{withdrawalId}/reject"]).toBeUndefined();
    expect(paths["/api/withdrawals/{withdrawalId}/cancel"].post["x-required-api-scope"]).toBe(
      "withdrawals:create",
    );
    expect(paths["/api/withdrawals/{withdrawalId}/complete"].post["x-required-api-scope"]).toBe(
      "withdrawals:manage",
    );
    expect(paths["/api/withdrawals/{withdrawalId}/payout"]).toBeUndefined();
    expect(paths["/api/withdrawals/{withdrawalId}/payout/reconcile"]).toBeUndefined();
    expect(paths["/api/treasury"].get).toMatchObject({
      "x-authentication-mode": "account",
      "x-required-api-scope": "treasury:read",
    });
    expect(paths["/api/treasury"].get.description ?? "").not.toContain("Authentication:");
    expect(paths["/api/treasury/entries"].post).toMatchObject({
      "x-authentication-mode": "account",
      "x-required-api-scope": "treasury:manage",
    });
    expect(paths["/api/blog/posts"]).toBeDefined();
    expect(paths["/api/catalogue/bulk"]).toBeUndefined();
    expect(paths["/api/catalogue/categories"]).toMatchObject({
      get: { "x-authentication-mode": "anonymous", "x-public-access": true },
      post: {
        "x-authentication-mode": "account",
        "x-required-api-scope": "catalogue:manage",
      },
    });
    expect(paths["/api/catalogue/categories/{categoryId}"]).toMatchObject({
      get: { "x-required-api-scope": "catalogue:manage" },
      patch: { "x-required-api-scope": "catalogue:manage" },
      delete: { "x-required-api-scope": "catalogue:manage" },
    });
    expect(paths["/api/catalogue/categories/bulk"]).toBeUndefined();
    expect(paths["/api/reviews/bulk"]).toBeUndefined();
    expect(paths["/api/reviews/{reviewId}"].patch).toMatchObject({
      tags: ["Reviews"],
      summary: "Moderate a review",
      description: expect.stringContaining("pending review"),
      "x-authentication-mode": "account",
      "x-required-api-scope": "reviews:moderate",
    });
    expect(
      paths["/api/reviews/{reviewId}"].patch.requestBody.content["application/json"].schema
        .properties.status.description,
    ).toContain("supported status values and transitions");
    expect(paths["/api/reviews/{reviewId}"].patch.responses["409"].description).toBe(
      "Review is not pending",
    );
    expect(paths["/api/blog/categories"].get).toMatchObject({
      "x-authentication-mode": "anonymous",
      "x-public-access": true,
    });
    expect(paths["/api/blog/posts/bulk"]).toBeUndefined();
    expect(paths["/api/blog/categories/bulk"]).toBeUndefined();
    expect(paths["/api/blog/previews"].post).toMatchObject({
      "x-authentication-mode": "session_only",
    });
    expect(paths["/api/blog/previews/{previewId}"].delete).toMatchObject({
      "x-authentication-mode": "session_only",
    });
    const postInput = paths["/api/blog/posts"].post.requestBody.content["application/json"].schema;
    expect(postInput.properties).toHaveProperty("status");
    expect(postInput.properties).toHaveProperty("category_ids");
    expect(postInput.properties).not.toHaveProperty("category_id");
    const categoryInput =
      paths["/api/blog/categories"].post.requestBody.content["application/json"].schema;
    expect(categoryInput.properties).toHaveProperty("slug");
    const operatorPost =
      paths["/api/blog/posts"].get.responses["200"].content["application/json"].schema;
    expect(JSON.stringify(operatorPost)).toContain("categories");
    expect(JSON.stringify(operatorPost)).not.toContain("revisionId");
    expect(paths["/api/blog/posts/{postId}/publish"]).toBeUndefined();
    expect(paths["/api/blog/posts/{postId}/unpublish"]).toBeUndefined();
    expect(paths["/api/listings/{listingId}/publish"]).toBeUndefined();
    expect(paths["/api/listings/{listingId}/restore"]).toBeUndefined();
    expect(paths["/api/reviews/{reviewId}/approve"]).toBeUndefined();
    expect(paths["/api/reviews/{reviewId}/reject"]).toBeUndefined();
    expect(paths["/api/gateway"]).toBeUndefined();
    expect(paths["/api/auth/sessions"]).toBeUndefined();
    expect(paths["/api/listings"].get).toMatchObject({
      "x-authentication-mode": "anonymous",
    });
    expect(paths["/api/listings"].get.security).toBeUndefined();
    expect(paths["/api/accounts"].post.tags).toEqual(["Accounts"]);
    expect(paths["/api/accounts"].get.tags).toEqual(["Accounts"]);
    expect(paths["/api/listings"].get.tags).toEqual(["Listings"]);
    expect(paths["/api/payments"].get.tags).toEqual(["Payments"]);
    for (const [path, pathItem] of Object.entries(paths))
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
        expect(operation.summary, `${method.toUpperCase()} ${path} summary`).toBeTruthy();
        expect(operation.description, `${method.toUpperCase()} ${path} description`).toBeTruthy();
        expect(operation.tags, `${method.toUpperCase()} ${path} tags`).not.toHaveLength(0);
      }
    expect(paths["/api/wallet"].get).toMatchObject({
      "x-authentication-mode": "account",
      "x-required-api-scope": "wallet:read",
      security: [{ CliqeroApiKey: [] }],
    });
    expect(paths["/api/wallet"].get.description ?? "").not.toContain("Authentication:");
    expect(paths["/api/wallet"].get.responses["401"]).toMatchObject({
      description: "Authentication required",
      content: { "application/json": { schema: { required: ["error"] } } },
    });
    expect(paths["/api/wallet"].get.responses["403"]).toMatchObject({
      description: "Insufficient permissions",
      content: { "application/json": { schema: { required: ["error"] } } },
    });
    expect(paths["/api/me/session"].get).toMatchObject({
      "x-authentication-mode": "session",
    });
    expect(paths["/api/me/session"].get.security).toBeUndefined();
    expect(paths["/api/me/profile"].get).toMatchObject({
      "x-authentication-mode": "session_only",
    });
    expect(paths["/api/me/profile"].get.security).toBeUndefined();
    expect(paths["/api/me/profile"].get.responses["401"].description).toBe(
      "Authentication required",
    );
    expect(paths["/api/me/profile"].get.responses["403"].description).toBe(
      "Insufficient permissions",
    );
    expect(paths["/api/listings"].get["x-authentication-mode"]).toBe("anonymous");
    expect(paths["/api/listings"].get.security).toBeUndefined();
    expect(paths["/api/listings"].get.responses["401"]).toBeUndefined();
    expect(paths["/api/listings"].get.responses["403"]).toBeUndefined();
    expect(paths["/api/accounts"].post["x-authentication-mode"]).toBe("mixed");
    expect(paths["/api/accounts"].post.responses["401"].description).toBe(
      "Authentication required",
    );
    expect(paths["/api/accounts"].post.responses["403"].description).toBe(
      "Account management permission required",
    );
    expect(paths["/api/access/verify"].post).toMatchObject({
      "x-authentication-mode": "integration_credential",
    });
    expect(paths["/api/access/verify"].post.responses["401"].description).toBe(
      "Authentication required",
    );
    expect(paths["/api/access/verify"].post.responses["403"]).toBeUndefined();
  });
  it("renders the exact generated OpenAPI document in Swagger", async () => {
    const app = appWith();
    const schemaResponse = await app.fetch(new Request("http://localhost/api/openapi.json"));
    const schema = await schemaResponse.json();
    const docsResponse = await swaggerUiResponse(
      new Request("http://localhost/docs"),
      { environment: "development", key: null },
      () => app.fetch(new Request("http://localhost/api/openapi.json")),
    );
    const html = await docsResponse.text();
    const embeddedSpec = html.match(
      /<script id="openapi-spec" type="application\/json">([\s\S]*?)<\/script>/,
    )?.[1];

    expect(docsResponse.status).toBe(200);
    expect(embeddedSpec).toBeDefined();
    expect(JSON.parse(embeddedSpec!)).toEqual(schema);
  });
  it("keeps development schema discovery convenient with or without a key", async () => {
    expect((await appWith().fetch(new Request("http://localhost/api/openapi.json"))).status).toBe(
      200,
    );
    expect(
      (
        await appWith().fetch(
          new Request("http://localhost/api/openapi.json", {
            headers: { "X-OpenAPI-Key": "anything" },
          }),
        )
      ).status,
    ).toBe(200);
  });
  it("protects non-development schema discovery without creating an API principal", async () => {
    const protectedAccess = { environment: "production", key: "schema-secret" } as const;
    const request = (key?: string) =>
      new Request("http://localhost/api/openapi.json", {
        headers: key === undefined ? {} : { "X-OpenAPI-Key": key },
      });
    expect((await appWith(null, protectedAccess).fetch(request("schema-secret"))).status).toBe(200);
    expect((await appWith(null, protectedAccess).fetch(request())).status).toBe(404);
    expect((await appWith(null, protectedAccess).fetch(request("wrong"))).status).toBe(404);
    expect((await appWith(null, protectedAccess).fetch(request(""))).status).toBe(404);
    expect(
      (
        await appWith(null, protectedAccess).fetch(
          new Request("http://localhost/api/api-keys", {
            headers: { "X-OpenAPI-Key": "schema-secret" },
          }),
        )
      ).status,
    ).toBe(404);
  });
  it("fails closed for missing non-development schema configuration", async () => {
    expect(
      (
        await appWith(null, { environment: "production", key: null }).fetch(
          new Request("http://localhost/api/openapi.json"),
        )
      ).status,
    ).toBe(404);
  });
  it("returns standardized auth errors and validates requests", async () => {
    const app = appWith();
    expect((await app.fetch(new Request("http://localhost/api/hierarchy/tree"))).status).toBe(401);
    expect(
      (await app.fetch(new Request("http://localhost/api/hierarchy/search?q=al"))).status,
    ).toBe(401);
    expect(
      (await app.fetch(new Request("http://localhost/api/hierarchy/descendants?level=1"))).status,
    ).toBe(401);
    expect((await app.fetch(new Request("http://localhost/api/hierarchy/levels"))).status).toBe(
      401,
    );
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session",
      capabilities: [],
      scopes: new Set<string>(),
    };
    const searchResponse = await appWith(principal).fetch(
      new Request("http://localhost/api/hierarchy/search?q=al&limit=10"),
    );
    expect(searchResponse.status).toBe(200);
    expect(await searchResponse.json()).toEqual({ items: [] });
    expect(
      (
        await appWith(principal).fetch(
          new Request("http://localhost/api/hierarchy/search?q=a&limit=10"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await appWith(principal).fetch(
          new Request("http://localhost/api/hierarchy/tree?root=not-a-uuid"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await appWith(principal).fetch(
          new Request("http://localhost/api/hierarchy/descendants?level=11"),
        )
      ).status,
    ).toBe(400);
  });
  it("accepts exact username lookup through the existing scoped hierarchy route", async () => {
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session",
      capabilities: [],
      scopes: new Set<string>(),
    };
    const hierarchySearch = vi.fn(async () => [
      { id: "account-id", username: "alpha_one", displayName: "Alpha" },
    ]);
    const response = await appWith(principal, undefined, hierarchySearch).fetch(
      new Request("http://localhost/api/hierarchy/search?q=alpha_one&exact=true&limit=1"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [{ id: "account-id", username: "alpha_one", displayName: "Alpha" }],
    });
    expect(hierarchySearch).toHaveBeenCalledWith(principal.accountId, "alpha_one", false, 1, true);
  });
  it("exposes safe current capabilities and protects the operator overview by capability and scope", async () => {
    const ordinary = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      capabilities: [],
      scopes: new Set<string>(),
    };
    expect((await appWith().fetch(new Request("http://localhost/api/me/access"))).status).toBe(401);
    const access = await appWith(ordinary).fetch(new Request("http://localhost/api/me/access"));
    expect(await access.json()).toEqual({
      accountId: ordinary.accountId,
      capabilities: [],
      canAccessOperator: false,
    });
    expect(
      (await appWith(ordinary).fetch(new Request("http://localhost/api/overview"))).status,
    ).toBe(403);
    const catalogueManager = { ...ordinary, capabilities: ["catalogue.manage"] };
    const catalogueResponse = await appWith(catalogueManager).fetch(
      new Request("http://localhost/api/overview"),
    );
    expect(catalogueResponse.status).toBe(200);
    expect((await catalogueResponse.json()).users).toBeUndefined();
    const operator = { ...ordinary, capabilities: ["system.root"] };
    expect(
      (await appWith(operator).fetch(new Request("http://localhost/api/overview"))).status,
    ).toBe(200);
    const missingScope = {
      ...operator,
      kind: "api_key" as const,
      scopes: new Set<string>(),
    };
    expect(
      (await appWith(missingScope).fetch(new Request("http://localhost/api/overview"))).status,
    ).toBe(403);
    const scopedOperator = {
      ...operator,
      kind: "api_key" as const,
      scopes: new Set<string>(["operations:manage"]),
    };
    expect(
      (await appWith(scopedOperator).fetch(new Request("http://localhost/api/overview"))).status,
    ).toBe(200);
    expect(
      (
        await appWith({
          ...operator,
          kind: "api_key" as const,
          scopes: new Set<string>(["catalogue:read"]),
        }).fetch(new Request("http://localhost/api/overview"))
      ).status,
    ).toBe(403);
    const elevatedOrdinary = {
      ...ordinary,
      kind: "api_key" as const,
      scopes: new Set<string>(["payments:manage"]),
    };
    expect(
      (await appWith(elevatedOrdinary).fetch(new Request("http://localhost/api/overview"))).status,
    ).toBe(403);
  });
  it("exposes a canonical browser session only for a linked user session", async () => {
    const accountId = "00000000-0000-4000-8000-000000000001";
    const ordinary = {
      accountId,
      account: { id: accountId, username: "ordinary" },
      kind: "user_session" as const,
      capabilities: [],
      scopes: new Set<string>(),
    };
    const response = await appWith(ordinary).fetch(new Request("http://localhost/api/me/session"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      authenticated: true,
      account: { id: accountId, username: "ordinary" },
    });
    expect((await appWith().fetch(new Request("http://localhost/api/me/session"))).status).toBe(
      401,
    );
    expect(
      (
        await appWith({ ...ordinary, kind: "api_key" as const }).fetch(
          new Request("http://localhost/api/me/session"),
        )
      ).status,
    ).toBe(401);
  });
  it("protects operator funding inspection with the capability and scope intersection", async () => {
    const ordinary = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      capabilities: [],
      scopes: new Set<string>(),
    };
    expect((await appWith().fetch(new Request("http://localhost/api/funding"))).status).toBe(401);
    expect(
      (await appWith(ordinary).fetch(new Request("http://localhost/api/funding"))).status,
    ).toBe(403);
    const catalogueManager = { ...ordinary, capabilities: ["catalogue.manage"] };
    expect(
      (await appWith(catalogueManager).fetch(new Request("http://localhost/api/funding"))).status,
    ).toBe(403);
    const operator = { ...ordinary, capabilities: ["system.root"] };
    expect(
      (await appWith(operator).fetch(new Request("http://localhost/api/funding"))).status,
    ).toBe(200);
    const operatorKey = {
      ...operator,
      kind: "api_key" as const,
      scopes: new Set<string>(["payments:read"]),
    };
    expect(
      (await appWith(operatorKey).fetch(new Request("http://localhost/api/funding"))).status,
    ).toBe(200);
    const missingScope = { ...operator, kind: "api_key" as const, scopes: new Set<string>() };
    expect(
      (await appWith(missingScope).fetch(new Request("http://localhost/api/funding"))).status,
    ).toBe(403);
    const elevatedCatalogue = {
      ...catalogueManager,
      kind: "api_key" as const,
      scopes: new Set<string>(["payments:read"]),
    };
    expect(
      (await appWith(elevatedCatalogue).fetch(new Request("http://localhost/api/funding"))).status,
    ).toBe(403);
  });
  it("keeps bank-transfer confirmation operator-only", async () => {
    const fundingId = "00000000-0000-4000-8000-000000000010";
    const ordinary = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      capabilities: [] as string[],
      scopes: new Set<string>(),
    };
    const request = () =>
      new Request(`http://localhost/api/funding/${fundingId}/confirm-bank-transfer`, {
        method: "POST",
      });
    expect((await appWith(ordinary).fetch(request())).status).toBe(403);
    expect(
      (await appWith({ ...ordinary, capabilities: ["finance.manage"] }).fetch(request())).status,
    ).toBe(200);
  });
  it("keeps withdrawal reads owner-scoped and operational queries capability/scope protected", async () => {
    const base = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      capabilities: [] as string[],
      scopes: new Set<string>(),
    };
    expect((await appWith().fetch(new Request("http://localhost/api/withdrawals"))).status).toBe(
      401,
    );
    const ownedRead = new Request("http://localhost/api/withdrawals");
    const operationalRead = new Request("http://localhost/api/withdrawals?state=all");
    expect((await appWith(base).fetch(ownedRead)).status).toBe(200);
    expect((await appWith(base).fetch(operationalRead)).status).toBe(403);
    expect(
      (await appWith({ ...base, capabilities: ["catalogue.manage"] }).fetch(operationalRead))
        .status,
    ).toBe(403);
    const operator = { ...base, capabilities: ["system.root"] };
    expect((await appWith(operator).fetch(operationalRead)).status).toBe(200);
    expect(
      (
        await appWith({
          ...operator,
          kind: "api_key" as const,
          scopes: new Set(["withdrawals:manage"]),
        }).fetch(operationalRead)
      ).status,
    ).toBe(200);
    expect(
      (
        await appWith({
          ...base,
          kind: "api_key" as const,
          scopes: new Set(["withdrawals:manage"]),
        }).fetch(operationalRead)
      ).status,
    ).toBe(403);
    const patch = () =>
      new Request("http://localhost/api/withdrawals/00000000-0000-4000-8000-000000000010", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
    expect((await appWith().fetch(patch())).status).toBe(401);
    expect((await appWith(base).fetch(patch())).status).toBe(403);
    expect((await appWith(operator).fetch(patch())).status).toBe(200);
    expect(
      (
        await appWith({
          ...operator,
          kind: "api_key" as const,
          scopes: new Set(["withdrawals:manage"]),
        }).fetch(patch())
      ).status,
    ).toBe(200);
  });
  it("uses PATCH for ordinary state updates without action-specific state routes", async () => {
    const owner = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      capabilities: [],
      scopes: new Set<string>(),
    };
    const patch = new Request(
      "http://localhost/api/withdrawals/00000000-0000-4000-8000-000000000010",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      },
    );
    expect(getLegacyRouteAccess(new URL(patch.url).pathname, patch.method)).toEqual({
      mode: "account",
      scope: "withdrawals:manage",
    });
    expect(
      (
        await appWith(owner).fetch(
          new Request("http://localhost/api/withdrawals/00000000-0000-4000-8000-000000000010", {
            method: "DELETE",
          }),
        )
      ).status,
    ).toBe(405);

    const operator = { ...owner, capabilities: ["system.root"] };
    for (const action of ["approve", "reject", "payout", "payout/reconcile"]) {
      expect(
        (
          await appWith(operator).fetch(
            new Request(
              `http://localhost/api/withdrawals/00000000-0000-4000-8000-000000000010/${action}`,
              { method: "POST" },
            ),
          )
        ).status,
      ).toBe(404);
    }
  });
  it("records manual completion only through its withdrawals manage command", async () => {
    const ordinary = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      capabilities: [],
      scopes: new Set<string>(),
    };
    const path = "/api/withdrawals/00000000-0000-4000-8000-000000000010/complete";
    const request = (url = path) =>
      new Request(`http://localhost${url}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          external_reference: "transfer-1",
          note: "Sent outside Cliqero",
        }),
      });

    expect((await appWith(ordinary).fetch(request())).status).toBe(403);
    expect(
      (
        await appWith({
          ...ordinary,
          kind: "api_key" as const,
          capabilities: ["system.root"],
          scopes: new Set<string>(),
        }).fetch(request())
      ).status,
    ).toBe(403);
    const complete = vi.fn(async (_actor: string, id: string, input: unknown) => ({ id, input }));
    const allowedResponse = await appWith(
      {
        ...ordinary,
        kind: "api_key" as const,
        capabilities: ["system.root"],
        scopes: new Set(["withdrawals:manage"]),
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { complete },
    ).fetch(request());
    expect(allowedResponse.status).toBe(200);
    expect(complete).toHaveBeenCalledWith(
      ordinary.accountId,
      "00000000-0000-4000-8000-000000000010",
      { externalReference: "transfer-1", note: "Sent outside Cliqero" },
    );
    expect(
      (
        await appWith({ ...ordinary, capabilities: ["system.root"] }).fetch(
          new Request("http://localhost/api/withdrawals/00000000-0000-4000-8000-000000000010", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "completed", external_reference: "not-accepted" }),
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("exposes customer cancellation as a command, not a PATCH state", async () => {
    const ownerKey = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "api_key" as const,
      capabilities: [],
      scopes: new Set(["withdrawals:create"]),
    };
    const path = "/api/withdrawals/00000000-0000-4000-8000-000000000010";
    const cancelled = vi.fn(async () => ({ id: "withdrawal-1", state: "cancelled" }));
    const app = appWith(
      ownerKey,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { cancel: cancelled },
    );
    const response = await app.fetch(
      new Request(`http://localhost${path}/cancel`, { method: "POST" }),
    );
    expect(response.status).toBe(200);
    expect(cancelled).toHaveBeenCalledWith(
      ownerKey.accountId,
      "00000000-0000-4000-8000-000000000010",
    );

    const patch = await app.fetch(
      new Request(`http://localhost${path}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      }),
    );
    expect(patch.status).toBe(400);
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it("protects distribution and earnings inspection with the capability and scope intersection", async () => {
    const ordinary = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      capabilities: [],
      scopes: new Set<string>(),
    };
    for (const path of ["/api/distributions", "/api/earnings/entries"]) {
      expect((await appWith().fetch(new Request(`http://localhost${path}`))).status).toBe(401);
      expect((await appWith(ordinary).fetch(new Request(`http://localhost${path}`))).status).toBe(
        403,
      );
      expect(
        (
          await appWith({ ...ordinary, capabilities: ["catalogue.manage"] }).fetch(
            new Request(`http://localhost${path}`),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await appWith({ ...ordinary, capabilities: ["system.root"] }).fetch(
            new Request(`http://localhost${path}`),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await appWith({
            ...ordinary,
            capabilities: ["system.root"],
            kind: "api_key" as const,
            scopes: new Set<string>(),
          }).fetch(new Request(`http://localhost${path}`))
        ).status,
      ).toBe(403);
      expect(
        (
          await appWith({
            ...ordinary,
            capabilities: ["system.root"],
            kind: "api_key" as const,
            scopes: new Set<string>(["payments:read"]),
          }).fetch(new Request(`http://localhost${path}`))
        ).status,
      ).toBe(200);
      expect(
        (
          await appWith({
            ...ordinary,
            capabilities: ["catalogue.manage"],
            kind: "api_key" as const,
            scopes: new Set<string>(["payments:read"]),
          }).fetch(new Request(`http://localhost${path}`))
        ).status,
      ).toBe(403);
    }
  });
  it("allows a resolved principal through the protected read route", async () => {
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session",
      capabilities: [],
      scopes: new Set<string>(),
    };
    const response = await appWith(principal).fetch(
      new Request("http://localhost/api/hierarchy/tree"),
    );
    expect(response.status).toBe(200);
  });
  it("dispatches compatibility application routes through the Hono boundary", async () => {
    const response = await appWith().fetch(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "cliqero-main" });
  });
  it("returns a canonical not-found response for the removed gateway route", async () => {
    const response = await appWith().fetch(new Request("http://localhost/api/gateway"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found", code: "not_found" });
  });
  it("lets Hono decide HEAD, OPTIONS, and unsupported method behavior", async () => {
    const app = appWith();
    expect(
      (await app.fetch(new Request("http://localhost/api/health", { method: "HEAD" }))).status,
    ).toBe(405);
    expect(
      (await app.fetch(new Request("http://localhost/api/health", { method: "OPTIONS" }))).status,
    ).toBe(405);
    expect(
      (await app.fetch(new Request("http://localhost/api/not-a-route", { method: "OPTIONS" })))
        .status,
    ).toBe(404);
  });
  it("does not register API-key administration on the external API router", async () => {
    const app = appWith();
    for (const [path, method] of [
      ["/api/api-keys", "GET"],
      ["/api/api-keys", "POST"],
      ["/api/api-keys/00000000-0000-4000-8000-000000000001", "GET"],
      ["/api/api-keys/00000000-0000-4000-8000-000000000001", "PATCH"],
      ["/api/api-keys/00000000-0000-4000-8000-000000000001", "DELETE"],
      ["/api/accounts/00000000-0000-4000-8000-000000000001/api-keys", "GET"],
    ] as const) {
      expect((await app.fetch(new Request(`http://localhost${path}`, { method }))).status).toBe(
        404,
      );
    }
  });
  it("enforces capability and API-key scope intersection for compatibility routes", async () => {
    const operatorKey = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "api_key" as const,
      capabilities: ["system.root"],
      scopes: new Set<string>(["payments:manage"]),
    } as any;
    const operatorScope = getLegacyRouteAccess("/api/earnings/settlement", "POST");
    expect(operatorScope).toEqual({
      mode: "account",
      scope: "payments:manage",
      capability: "finance.manage",
    });
    expect(
      authorizeLegacyRequest(
        new Request("http://localhost/api/earnings/settlement", { method: "POST" }),
        operatorKey,
        operatorScope!,
      ),
    ).toBeNull();
    const missingScope = getLegacyRouteAccess("/api/earnings/settlement", "POST");
    const denied = authorizeLegacyRequest(
      new Request("http://localhost/api/earnings/settlement", { method: "POST" }),
      { ...operatorKey, scopes: new Set<string>() },
      missingScope!,
    );
    expect(denied?.status).toBe(403);
    const normalKey = authorizeLegacyRequest(
      new Request("http://localhost/api/earnings/settlement", { method: "POST" }),
      { ...operatorKey, capabilities: [], scopes: new Set<string>(["payments:manage"]) },
      operatorScope!,
    );
    expect(normalKey?.status).toBe(403);

    const lowScopeKey = { ...operatorKey, scopes: new Set<string>(["wallet:read"]) };
    const settlementRequest = new Request("http://localhost/api/earnings/settlement", {
      method: "POST",
    });
    const actualDispatch = await appWith(lowScopeKey).fetch(settlementRequest);
    expect(actualDispatch.status).toBe(403);
    expect(authorizeLegacyRequest(settlementRequest, operatorKey, operatorScope!)).toBeNull();
    const browserSession = {
      ...operatorKey,
      kind: "user_session" as const,
      capabilities: ["finance.manage"],
      scopes: new Set<string>(),
    };
    expect(authorizeLegacyRequest(settlementRequest, browserSession, operatorScope!)).toBeNull();

    expect(legacyApiPaths.some((route) => route.path.startsWith("/api/operator/"))).toBe(false);
    expect(getLegacyRouteAccess("/api/operator/paystack/events", "GET")).toBeNull();
    expect(
      (await appWith(operatorKey).fetch(new Request("http://localhost/api/operator/unclassified")))
        .status,
    ).toBe(404);
    expect(getLegacyRouteAccess("/api/distribution-policy", "GET")).toEqual({
      mode: "account",
      scope: "payments:read",
      capability: "finance.read",
    });
    expect(getLegacyRouteAccess("/api/me/earnings/entries", "GET")).toEqual({
      mode: "account",
      scope: "earnings:read",
    });
    expect(getLegacyRouteAccess("/api/listings", "GET")).toEqual({
      mode: "anonymous",
      apiKey: "allow",
    });
    expect(
      getLegacyRouteAccess("/api/listings/00000000-0000-4000-8000-000000000001", "GET"),
    ).toEqual({
      mode: "anonymous",
      apiKey: "allow",
    });
    expect(getLegacyRouteAccess("/api/listings/export", "GET")).toEqual({
      mode: "account",
      scope: "catalogue:manage",
      capability: "catalogue.manage",
    });
    expect(getLegacyRouteAccess("/api/checkout/id/pay", "POST")).toEqual({
      mode: "account",
      scope: "checkout:create",
    });
    expect(
      getLegacyRouteAccess(
        "/api/listings/00000000-0000-4000-8000-000000000001/integrations",
        "GET",
      ),
    ).toEqual({ mode: "account" });
    expect(
      getLegacyRouteAccess("/api/listings/00000000-0000-4000-8000-000000000001", "PATCH"),
    ).toEqual({
      mode: "account",
      scope: "catalogue:manage",
      capability: "catalogue.manage",
    });
    const referralUrlAccess = getLegacyRouteAccess(
      "/api/listings/00000000-0000-4000-8000-000000000001/referral-url",
      "GET",
    );
    expect(referralUrlAccess).toEqual({
      mode: "session_only",
      apiKey: "reject",
    });
    expect(
      authorizeLegacyRequest(
        new Request("http://localhost/api/listings/id/referral-url", { method: "GET" }),
        operatorKey,
        referralUrlAccess!,
      )?.status,
    ).toBe(403);
    expect(
      authorizeLegacyRequest(
        new Request("http://localhost/api/listings/00000000-0000-4000-8000-000000000001", {
          method: "PATCH",
          headers: { authorization: "Bearer cliq_live_test" },
        }),
        { ...operatorKey, scopes: new Set<string>() },
        getLegacyRouteAccess("/api/listings/00000000-0000-4000-8000-000000000001", "PATCH")!,
      )?.status,
    ).toBe(403);
    expect(
      getLegacyRouteAccess("/api/withdrawals/00000000-0000-4000-8000-000000000001", "PATCH"),
    ).toEqual({
      mode: "account",
      scope: "withdrawals:manage",
    });
    expect(
      getLegacyRouteAccess(
        "/api/wallet/fund/00000000-0000-4000-8000-000000000001/evidence",
        "POST",
      ),
    ).toEqual({
      mode: "account",
      scope: "wallet:fund",
    });
    const publicDetail = authorizeLegacyRequest(
      new Request("http://localhost/api/listings/00000000-0000-4000-8000-000000000001", {
        method: "GET",
        headers: { authorization: "Bearer cliq_live_test" },
      }),
      operatorKey,
      getLegacyRouteAccess("/api/listings/00000000-0000-4000-8000-000000000001", "GET")!,
    );
    expect(publicDetail).toBeNull();
  });
  it("lets an authenticated but incomplete session reach onboarding only", () => {
    const access = getLegacyRouteAccess("/api/me/onboarding", "POST");
    expect(access).toEqual({
      mode: "session_only",
      apiKey: "reject",
      allowIncompleteSession: true,
    });
    expect(
      authorizeLegacyRequest(
        new Request("http://localhost/api/me/onboarding", { method: "POST" }),
        null,
        access!,
      ),
    ).toBeNull();
    const keyDenied = authorizeLegacyRequest(
      new Request("http://localhost/api/me/onboarding", { method: "POST" }),
      {
        accountId: "account",
        account: {},
        kind: "api_key",
        capabilities: [],
        scopes: new Set(),
      } as any,
      access!,
    );
    expect(keyDenied?.status).toBe(403);
  });
  it("keeps incomplete sessions out of unrelated account and operator APIs", async () => {
    const app = appWith();
    for (const path of ["/api/wallet", "/api/purchases", "/api/checkout", "/api/treasury"]) {
      const request =
        path === "/api/checkout"
          ? new Request(`http://localhost${path}`, { method: "POST" })
          : new Request(`http://localhost${path}`);
      expect((await app.fetch(request)).status).toBe(401);
    }
  });
  it("does not let an API-key scope elevate a non-operator account", async () => {
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "api_key" as const,
      capabilities: [],
      scopes: new Set<string>(["hierarchy:admin"]),
    } as any;
    const response = await appWith(principal).fetch(
      new Request("http://localhost/api/hierarchy/00000000-0000-4000-8000-000000000002/parent", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parent_account_id: "00000000-0000-4000-8000-000000000003" }),
      }),
    );
    expect(response.status).toBe(403);
  });
  it("protects operator account inspection with capability and operations scope", async () => {
    const ordinary = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      capabilities: [],
      scopes: new Set<string>(),
    };
    expect((await appWith().fetch(new Request("http://localhost/api/accounts"))).status).toBe(401);
    expect(
      (await appWith(ordinary).fetch(new Request("http://localhost/api/accounts"))).status,
    ).toBe(403);
    expect(
      (
        await appWith({ ...ordinary, capabilities: ["accounts.read"] }).fetch(
          new Request("http://localhost/api/accounts"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await appWith({
          ...ordinary,
          kind: "api_key",
          capabilities: ["accounts.read"],
          scopes: new Set(["accounts:read"]),
        }).fetch(new Request("http://localhost/api/accounts"))
      ).status,
    ).toBe(200);
    expect(
      (
        await appWith({ ...ordinary, capabilities: ["catalogue.manage"] }).fetch(
          new Request("http://localhost/api/accounts"),
        )
      ).status,
    ).toBe(403);
    const operator = { ...ordinary, capabilities: ["system.root"] };
    expect(
      (await appWith(operator).fetch(new Request("http://localhost/api/accounts"))).status,
    ).toBe(200);
    expect(
      (
        await appWith({ ...operator, kind: "api_key", scopes: new Set<string>() }).fetch(
          new Request("http://localhost/api/accounts"),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await appWith({
          ...operator,
          kind: "api_key",
          scopes: new Set(["accounts:read"]),
        }).fetch(new Request("http://localhost/api/accounts"))
      ).status,
    ).toBe(200);
    expect(
      (
        await appWith({
          ...ordinary,
          kind: "api_key",
          scopes: new Set(["accounts:read"]),
        }).fetch(new Request("http://localhost/api/accounts"))
      ).status,
    ).toBe(403);
  });
  it("requires accounts.manage for account mutations and rejects mass-assignment fields", async () => {
    const target = "00000000-0000-4000-8000-000000000007";
    const base = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      capabilities: [] as string[],
      scopes: new Set<string>(),
    };
    const create = (principal: any, body: object) =>
      appWith(principal).fetch(
        new Request("http://localhost/api/accounts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    const body = {
      email: "new@example.test",
      username: "new_user",
      credential_setup: { mode: "email" },
    };

    expect((await create(null, body)).status).toBe(401);
    expect((await create({ ...base, capabilities: ["accounts.read"] }, body)).status).toBe(403);
    expect(
      (
        await create(
          { ...base, capabilities: ["accounts.manage"] },
          { ...body, password: "must-not-be-accepted" },
        )
      ).status,
    ).toBe(400);
    expect((await create({ ...base, capabilities: ["accounts.manage"] }, body)).status).toBe(201);
    const manualPassword = "ManualPassword!2026";
    const manualResponse = await create(
      { ...base, capabilities: ["accounts.manage"] },
      {
        email: "manual@example.test",
        username: "manual_user",
        credential_setup: {
          mode: "password",
          password: manualPassword,
          confirm_password: manualPassword,
        },
      },
    );
    expect(manualResponse.status).toBe(201);
    expect(await manualResponse.text()).not.toContain(manualPassword);
    expect(
      (
        await create(
          { ...base, capabilities: ["accounts.manage"] },
          {
            email: "mismatch@example.test",
            username: "mismatch_user",
            credential_setup: {
              mode: "password",
              password: manualPassword,
              confirm_password: "not-the-same",
            },
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await create(
          { ...base, capabilities: ["accounts.manage"] },
          {
            email: "short@example.test",
            username: "short_user",
            credential_setup: { mode: "password", password: "short", confirm_password: "short" },
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (await create({ ...base, kind: "api_key", capabilities: ["accounts.manage"] }, body)).status,
    ).toBe(403);
    expect(
      (
        await create(
          {
            ...base,
            kind: "api_key",
            capabilities: ["system.root"],
            scopes: new Set<string>(),
          },
          body,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await create(
          {
            ...base,
            kind: "api_key",
            capabilities: ["accounts.manage"],
            scopes: new Set(["accounts:manage"]),
          },
          body,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await create(
          {
            ...base,
            kind: "api_key",
            capabilities: ["system.root"],
            scopes: new Set(["accounts:manage"]),
          },
          body,
        )
      ).status,
    ).toBe(201);

    const update = (principal: any, value: object) =>
      appWith(principal).fetch(
        new Request(`http://localhost/api/accounts/${target}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(value),
        }),
      );
    expect(
      (await update({ ...base, capabilities: ["accounts.read"] }, { country: "NG" })).status,
    ).toBe(403);
    expect(
      (
        await update(
          { ...base, capabilities: ["accounts.manage"] },
          { username: "changed", email: "spoof@example.test" },
        )
      ).status,
    ).toBe(400);
    expect(
      (await update({ ...base, capabilities: ["accounts.manage"] }, { country: "NG" })).status,
    ).toBe(200);
    expect(
      (
        await appWith({ ...base, capabilities: ["accounts.manage"] }).fetch(
          new Request(`http://localhost/api/accounts/${target}`, { method: "DELETE" }),
        )
      ).status,
    ).toBe(204);

    const duplicateBulkIds = await appWith({
      ...base,
      capabilities: ["accounts.manage"],
    }).fetch(
      new Request("http://localhost/api/accounts/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          ids: [
            "00000000-0000-4000-8000-000000000007",
            "00000000-0000-4000-8000-000000000007".toUpperCase(),
          ],
        }),
      }),
    );
    expect(duplicateBulkIds.status).toBe(404);

    const deletePath = `http://localhost/api/accounts/${target}`;
    expect(
      (
        await appWith({
          ...base,
          kind: "api_key",
          capabilities: ["system.root", "accounts.manage"],
          scopes: new Set(["payments:manage"]),
        }).fetch(new Request(deletePath, { method: "DELETE" }))
      ).status,
    ).toBe(403);
    expect(
      (
        await appWith({
          ...base,
          kind: "api_key",
          capabilities: ["system.root", "accounts.manage"],
          scopes: new Set(["accounts:manage"]),
        }).fetch(new Request(deletePath, { method: "DELETE" }))
      ).status,
    ).toBe(204);
  });
  it("keeps capability administration session-only and explicit", async () => {
    const target = "00000000-0000-4000-8000-000000000002";
    const ordinary = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      capabilities: [],
      scopes: new Set<string>(),
    };
    const path = `http://localhost/api/accounts/${target}/capabilities`;
    expect((await appWith().fetch(new Request(path))).status).toBe(401);
    expect(
      (await appWith({ ...ordinary, capabilities: ["accounts.read"] }).fetch(new Request(path)))
        .status,
    ).toBe(403);
    const admin = { ...ordinary, capabilities: ["capabilities.manage"] };
    expect((await appWith(admin).fetch(new Request(path))).status).toBe(200);
    expect((await appWith({ ...admin, kind: "api_key" }).fetch(new Request(path))).status).toBe(
      403,
    );
    const grant = await appWith(admin).fetch(
      new Request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capability: "catalogue.manage" }),
      }),
    );
    expect(grant.status).toBe(200);
    const revoke = await appWith(admin).fetch(
      new Request(`${path}/catalogue.manage`, { method: "DELETE" }),
    );
    expect(revoke.status).toBe(200);
  });
  it("allows an operator hierarchy key to use hierarchy:admin without a redundant read scope", async () => {
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "api_key" as const,
      capabilities: ["system.root"],
      scopes: new Set<string>(["hierarchy:admin"]),
    };
    const response = await appWith(principal).fetch(
      new Request("http://localhost/api/hierarchy/tree?root=00000000-0000-4000-8000-000000000002"),
    );
    expect(response.status).toBe(200);
  });
  it("protects treasury APIs by both capability and treasury scope", async () => {
    const base = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: { username: "system.root", email: "operator@example.com" },
      kind: "user_session" as const,
      capabilities: [] as string[],
      scopes: new Set<string>(),
    };
    const get = (principal: any) =>
      appWith(principal).fetch(new Request("http://localhost/api/treasury"));
    expect((await get(base)).status).toBe(403);
    expect((await get({ ...base, capabilities: ["catalogue.manage"] })).status).toBe(403);
    expect((await get({ ...base, capabilities: ["system.root"] })).status).toBe(200);
    expect((await get({ ...base, capabilities: ["system.root"], kind: "api_key" })).status).toBe(
      403,
    );
    expect(
      (
        await get({
          ...base,
          capabilities: ["system.root"],
          kind: "api_key",
          scopes: new Set(["treasury:read"]),
        })
      ).status,
    ).toBe(200);
    const post = (principal: any) =>
      appWith(principal).fetch(
        new Request("http://localhost/api/treasury/entries", {
          method: "POST",
          headers: { "content-type": "application/json", "Idempotency-Key": "test-key" },
          body: JSON.stringify({ direction: "credit", amount_minor: "100", title: "Test" }),
        }),
      );
    expect((await post({ ...base, capabilities: ["system.root"] })).status).toBe(201);
    expect((await post({ ...base, capabilities: ["system.root"], kind: "api_key" })).status).toBe(
      403,
    );
    expect(
      (
        await post({
          ...base,
          capabilities: ["system.root"],
          kind: "api_key",
          scopes: new Set(["treasury:manage"]),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post({
          ...base,
          kind: "api_key",
          scopes: new Set(["treasury:manage"]),
        })
      ).status,
    ).toBe(403);
  });
  it("validates treasury-entry sorting parameters", async () => {
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: { username: "system.root", email: "operator@example.com" },
      kind: "user_session" as const,
      capabilities: ["system.root"],
      scopes: new Set<string>(),
    };
    const request = (query: string) =>
      appWith(principal).fetch(new Request(`http://localhost/api/treasury/entries${query}`));

    expect((await request("?sort=drop_table")).status).toBe(400);
    expect((await request("?sort_direction=sideways")).status).toBe(400);
    expect((await request("?sort=amount&sort_direction=asc")).status).toBe(200);
  });
  it("requires review moderation capability and scope for API-key principals", async () => {
    const base = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      capabilities: ["reviews.moderate"],
      scopes: new Set<string>(),
    };
    const url = "http://localhost/api/reviews?status=pending";
    expect((await appWith(base).fetch(new Request(url))).status).toBe(200);
    expect(
      (
        await appWith({ ...base, kind: "api_key", scopes: new Set<string>() }).fetch(
          new Request(url),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await appWith({
          ...base,
          kind: "api_key",
          scopes: new Set<string>(["reviews:moderate"]),
        }).fetch(new Request(url))
      ).status,
    ).toBe(200);
    expect(
      (
        await appWith({
          ...base,
          capabilities: [],
          kind: "api_key",
          scopes: new Set<string>(["reviews:moderate"]),
        }).fetch(new Request(url))
      ).status,
    ).toBe(403);
    expect(
      (
        await appWith({
          ...base,
          capabilities: ["system.root"],
          kind: "api_key",
          scopes: new Set<string>(),
        }).fetch(new Request(url))
      ).status,
    ).toBe(403);
  });
  it("keeps treasury facts append-only and rejects source/actor overrides", async () => {
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: { username: "system.root", email: "operator@example.com" },
      kind: "user_session" as const,
      capabilities: ["system.root"],
      scopes: new Set<string>(),
    };
    const response = await appWith(principal).fetch(
      new Request("http://localhost/api/treasury/entries", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": "strict-key" },
        body: JSON.stringify({
          direction: "credit",
          amount_minor: "100",
          title: "Unsafe override",
          source_kind: "distribution",
          actor_id: principal.accountId,
        }),
      }),
    );
    expect(response.status).toBe(400);
    const nonRoot = {
      ...principal,
      capabilities: [],
    };
    expect(
      (
        await appWith(nonRoot).fetch(
          new Request(
            "http://localhost/api/treasury/entries/00000000-0000-4000-8000-000000000004",
            {
              method: "DELETE",
            },
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("serializes expected request validation as a human-readable API error", async () => {
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: { id: "00000000-0000-4000-8000-000000000001", username: "reviewer" },
      kind: "user_session" as const,
      capabilities: [],
      scopes: new Set<string>(),
    };
    const response = await appWith(principal).fetch(
      new Request("http://localhost/api/listings/00000000-0000-4000-8000-000000000002/reviews/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating: 0 }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ code: "validation_error" });
    expect(body.fields.rating).toBe(body.error);
    expect(body.error).not.toContain('"origin"');
  });
});

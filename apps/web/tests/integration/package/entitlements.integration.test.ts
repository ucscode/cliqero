import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "@/api/hono";
import { createContainer, getContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
import { Entitlement } from "@/modules/entitlement/entitlement";

const databaseUrl = process.env.TEST_DATABASE_URL;
const previousDatabaseUrl = process.env.DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
const suite = databaseUrl ? describe : describe.skip;

suite("package entitlement integration API", () => {
  const app = createContainer(databaseUrl!);
  const api = createApiApp(app as any);

  beforeEach(async () => {
    await app.database.query(`truncate table
      kernel.audit_records,access_capability.integration_listings,access_capability.integrations,
      access_capability.access_grants,entitlement_capability.entitlements,
      purchase_capability.purchases,checkout_capability.checkouts,payment_capability.payments,
      listing_capability.listings,identity_capability.sessions,identity_capability.accounts,
      kernel.outbox_events,kernel.idempotency_records restart identity cascade`);
  });
  afterAll(async () => {
    await app.database.close();
    if (databaseUrl) await getContainer().database.close();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  async function createEntitlement(title = `Listing ${newId()}`) {
    const seller = await app.authentication.register({
      email: `seller-${newId()}@example.test`,
      username: `seller${newId().slice(0, 8)}`,
      password: "correct-horse-battery",
      country: "NG",
    });
    const buyer = await app.authentication.register({
      email: `buyer-${newId()}@example.test`,
      username: `buyer${newId().slice(0, 8)}`,
      password: "correct-horse-staple",
      country: "NG",
    });
    const listing = await app.listingService.createPublished(seller, {
      title,
      shortDescription: "A generic destination listing",
      longDescription: "The destination owns the functionality.",
      priceMinor: "100",
      currency: "USD",
      destination: "https://destination.example/package",
    });
    const checkout = await app.legacyProviderCheckout.initiate({
      buyerId: buyer.id,
      buyerEmail: (await app.profiles.get(buyer.id)).email,
      listingId: listing.id,
      providerName: "development",
      idempotencyKey: newId(),
    });
    const entitlement = await app.legacyPaymentCompletion.complete({
      paymentId: checkout.paymentId,
      correlationId: newId(),
    });
    const credential = await app.integrations.create(seller.id, "destination", listing.id);
    return { seller, buyer, listing, purchaseId: checkout.purchaseId!, entitlement, credential };
  }

  function entitlementUrl(id: string) {
    return `/api/package/entitlements/${id}`;
  }

  function headers(credential?: string): Record<string, string> {
    return credential ? { authorization: `Bearer ${credential}` } : {};
  }

  async function json(response: Response) {
    return (await response.json()) as Record<string, any>;
  }

  it("authenticates integration credentials and hides missing/out-of-scope resources identically", async () => {
    const first = await createEntitlement();
    const second = await createEntitlement();
    const missing = newId();
    const unauthenticated = await api.request(entitlementUrl(first.entitlement.id));
    const invalid = await api.request(entitlementUrl(first.entitlement.id), {
      headers: headers("cli_int_invalid"),
    });
    expect(unauthenticated.status).toBe(401);
    expect(invalid.status).toBe(401);

    const allowed = await api.request(entitlementUrl(first.entitlement.id), {
      headers: headers(first.credential.credential),
    });
    expect(allowed.status).toBe(200);
    expect(await json(allowed)).toEqual({
      id: first.entitlement.id,
      listing_id: first.listing.id,
      state: "active",
      expires_at: null,
      access_available: true,
    });

    const outsideScope = await api.request(entitlementUrl(second.entitlement.id), {
      headers: headers(first.credential.credential),
    });
    const outsideScopePatch = await api.request(entitlementUrl(second.entitlement.id), {
      method: "PATCH",
      headers: { ...headers(first.credential.credential), "content-type": "application/json" },
      body: JSON.stringify({ state: "revoked" }),
    });
    const notFound = await api.request(entitlementUrl(missing), {
      headers: headers(first.credential.credential),
    });
    const notFoundBody = await json(notFound);
    expect(outsideScope.status).toBe(404);
    expect(outsideScopePatch.status).toBe(404);
    expect(await json(outsideScope)).toEqual(notFoundBody);
    expect(await json(outsideScopePatch)).toEqual(notFoundBody);
  });

  it("enforces strict patch shape, safe state transitions, and expiry semantics", async () => {
    const value = await createEntitlement();
    const url = entitlementUrl(value.entitlement.id);
    const credentialHeaders = headers(value.credential.credential);
    const invalidBodies = [
      {},
      { state: "consumed", buyer_id: newId() },
      { state: "active", listing_id: newId() },
      { state: "active", purchase_id: newId() },
      { state: "active", id: newId() },
      { expires_at: "not-a-date" },
      { expires_at: "2020-01-01T00:00:00.000Z" },
    ];
    for (const body of invalidBodies) {
      const response = await api.request(url, {
        method: "PATCH",
        headers: { ...credentialHeaders, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }

    const futureExpiry = "2030-01-01T00:00:00.000Z";
    const setExpiry = await api.request(url, {
      method: "PATCH",
      headers: { ...credentialHeaders, "content-type": "application/json" },
      body: JSON.stringify({ expires_at: futureExpiry }),
    });
    expect(await json(setExpiry)).toMatchObject({
      state: "active",
      expires_at: futureExpiry,
      access_available: true,
    });
    const clearExpiry = await api.request(url, {
      method: "PATCH",
      headers: { ...credentialHeaders, "content-type": "application/json" },
      body: JSON.stringify({ expires_at: null }),
    });
    expect(await json(clearExpiry)).toMatchObject({ expires_at: null, access_available: true });

    const consumed = await api.request(url, {
      method: "PATCH",
      headers: { ...credentialHeaders, "content-type": "application/json" },
      body: JSON.stringify({ state: "consumed" }),
    });
    expect(consumed.status).toBe(200);
    expect(await json(consumed)).toMatchObject({ state: "consumed", access_available: false });
    const retry = await api.request(url, {
      method: "PATCH",
      headers: { ...credentialHeaders, "content-type": "application/json" },
      body: JSON.stringify({ state: "consumed" }),
    });
    expect(retry.status).toBe(200);
    await expect(app.buyerAccess.handoffPurchase(value.buyer, value.purchaseId)).rejects.toThrow(
      "Active entitlement not found",
    );
    const resurrect = await api.request(url, {
      method: "PATCH",
      headers: { ...credentialHeaders, "content-type": "application/json" },
      body: JSON.stringify({ state: "active" }),
    });
    expect(resurrect.status).toBe(409);
  });

  it.each(["revoked", "expired"] as const)(
    "supports active -> %s and prevents reopening",
    async (state) => {
      const value = await createEntitlement();
      const destination = await app.buyerAccess.handoffPurchase(value.buyer, value.purchaseId);
      const source = destination.searchParams.get("source")!;
      const url = entitlementUrl(value.entitlement.id);
      const auth = headers(value.credential.credential);
      const response = await api.request(url, {
        method: "PATCH",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ state }),
      });
      expect(response.status).toBe(200);
      expect(await json(response)).toMatchObject({ state, access_available: false });
      const integration = await app.integrations.authenticate(value.credential.credential);
      expect(integration).not.toBeNull();
      expect((await app.access.verify(source, integration!)).authorized).toBe(false);
      const retry = await api.request(url, {
        method: "PATCH",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ state: "active" }),
      });
      expect(retry.status).toBe(409);
    },
  );

  it("allows a past expiry only when the same patch marks the entitlement expired", async () => {
    const value = await createEntitlement();
    const response = await api.request(entitlementUrl(value.entitlement.id), {
      method: "PATCH",
      headers: {
        ...headers(value.credential.credential),
        "content-type": "application/json",
      },
      body: JSON.stringify({ state: "expired", expires_at: "2020-01-01T00:00:00.000Z" }),
    });
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ state: "expired", access_available: false });
  });

  it("serializes concurrent consumption and invalidates existing source tokens", async () => {
    const value = await createEntitlement();
    const destination = await app.buyerAccess.handoffPurchase(value.buyer, value.purchaseId);
    const source = destination.searchParams.get("source")!;
    const auth = headers(value.credential.credential);
    const verify = () =>
      api.request("/api/access/verify", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ source }),
      });
    expect(await json(await verify())).toMatchObject({ authorized: true });

    const patch = () =>
      api.request(entitlementUrl(value.entitlement.id), {
        method: "PATCH",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ state: "consumed" }),
      });
    const results = await Promise.all([patch(), patch()]);
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    expect(await json(await verify())).toEqual({ authorized: false });
    expect(
      (
        await app.database.query(
          `select id from kernel.audit_records where action='entitlement.updated' and subject_id=$1`,
          [value.entitlement.id],
        )
      ).rowCount,
    ).toBe(1);
  });

  it("keeps elapsed active entitlements unusable and projects consumed without access", async () => {
    const value = await createEntitlement();
    const destination = await app.buyerAccess.handoffPurchase(value.buyer, value.purchaseId);
    const source = destination.searchParams.get("source")!;
    await app.database.query(
      `update entitlement_capability.entitlements set expires_at=now()-interval '1 second' where uuid=$1`,
      [value.entitlement.id],
    );
    const integration = await app.integrations.authenticate(value.credential.credential);
    expect(integration).not.toBeNull();
    expect((await app.access.verify(source, integration!)).authorized).toBe(false);
    const response = await api.request(entitlementUrl(value.entitlement.id), {
      headers: headers(value.credential.credential),
    });
    expect(await json(response)).toMatchObject({ state: "active", access_available: false });

    await app.entitlements.save(
      Entitlement.restore(
        value.entitlement.id,
        value.buyer.id,
        value.listing.id,
        value.purchaseId,
        "consumed",
        null,
      ),
    );
    expect(await app.accountProjections.purchase(value.buyer.id, value.purchaseId)).toMatchObject({
      entitlement_state: "consumed",
      access_available: false,
    });
  });
});

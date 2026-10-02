import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { InternalPurchaseRoutes } from "@/api/internal/purchases/handler";
import { createContainer } from "@/infrastructure/container";
import { OperatorBulkWorkflow } from "@/application/operator/bulk-workflow";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("operator purchase inspection", () => {
  const container = createContainer(databaseUrl!);
  let routes: InternalPurchaseRoutes;

  beforeEach(async () => {
    await container.database.query(`truncate table
      ledger_capability.entries,ledger_capability.purchase_distributions,
      checkout_capability.checkouts,purchase_capability.purchases,
      payment_capability.payments,listing_capability.listings,listing_capability.categories,
      identity_capability.account_capabilities,identity_capability.sessions,
      identity_capability.accounts,kernel.audit_records restart identity cascade`);
    const operator = await container.authentication.register({
      email: "purchase-operator@example.test",
      username: "purchase_operator",
      password: "correct-horse-battery",
      country: "NG",
    });
    const buyer = await container.authentication.register({
      email: "purchase-buyer@example.test",
      username: "purchase_buyer",
      password: "correct-horse-battery",
      country: "NG",
    });
    const seller = await container.authentication.register({
      email: "purchase-seller@example.test",
      username: "purchase_seller",
      password: "correct-horse-battery",
      country: "NG",
    });
    await container.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [operator.id],
    );
    const listing = await container.listingService.create(seller, {
      title: "Historical inspection listing",
      shortDescription: "Snapshot summary",
      longDescription: "Snapshot body",
      priceMinor: "2500",
      currency: "USD",
      destination: "https://example.test/inspection",
    });
    const purchaseIds: string[] = [];
    for (const [index, title] of [
      "Older historical purchase",
      "Newer historical purchase",
    ].entries()) {
      const result = await container.database.query<{ uuid: string }>(
        `insert into purchase_capability.purchases(
           idempotency_key,listing_title_snapshot,listing_short_description_snapshot,
           listing_long_description_snapshot,price_minor_snapshot,price_currency_snapshot,
           canonical_minor_snapshot,canonical_currency_snapshot,state,buyer_id,seller_id,listing_id
         ) values($1,$2,'Snapshot summary','Snapshot body',2500,'USD',2500,'USD','completed',
           (select id from identity_capability.accounts where uuid=$3),
           (select id from identity_capability.accounts where uuid=$4),
           (select id from listing_capability.listings where uuid=$5)) returning uuid`,
        [`operator-purchase-${index}`, title, buyer.id, seller.id, listing.id],
      );
      purchaseIds.push(result.rows[0].uuid);
    }
    await container.database.query(
      `update purchase_capability.purchases set created_at=case when idempotency_key=$1 then '2026-01-01'::timestamptz else '2026-02-01'::timestamptz end`,
      ["operator-purchase-0"],
    );
    await container.database.query(
      `insert into ledger_capability.purchase_distributions(uuid,purchase_id,gross_minor,currency,policy_snapshot,correlation_id,platform_amount_minor)
       select gen_random_uuid(),id,2500,'USD','{}'::jsonb,gen_random_uuid(),500
         from purchase_capability.purchases where uuid=$1`,
      [purchaseIds[1]],
    );
    routes = new InternalPurchaseRoutes({
      ...container,
      principalResolver: {
        resolve: async () => ({
          kind: "user_session" as const,
          accountId: operator.id,
          account: operator,
          capabilities: ["system.root"],
          scopes: new Set<string>(),
        }),
      },
    } as any);
  });

  afterAll(async () => {
    await container.database.close();
    await container.authentication.betterAuth.close();
  });

  it("filters and cursor-pages deterministic purchases, then exposes immutable detail context", async () => {
    const buyer = (
      await container.database.query<{ uuid: string }>(
        `select uuid from identity_capability.accounts where username='purchase_buyer'`,
      )
    ).rows[0].uuid;
    const query = new URLSearchParams({ buyer, state: "completed", limit: "1" });
    const firstResponse = await routes.collection(
      new Request(`http://localhost/internal/purchases?${query}`),
    );
    expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json();
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      state: "completed",
      buyer: { id: buyer },
      currency: "USD",
    });
    expect(first.nextCursor).toBeTruthy();
    query.set("cursor", first.nextCursor);
    const secondResponse = await routes.collection(
      new Request(`http://localhost/internal/purchases?${query}`),
    );
    const second = await secondResponse.json();
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(second.nextCursor).toBeNull();

    const detailResponse = await routes.item(
      new Request(`http://localhost/internal/purchases/${first.items[0].id}`),
      first.items[0].id,
    );
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject({
      id: first.items[0].id,
      listing_snapshot: {
        title: first.items[0].listing.title,
        short_description: "Snapshot summary",
      },
      payment: null,
    });
  });

  it("system.root bulk deletion physically removes a purchase and records the root audit", async () => {
    const id = (
      await container.database.query<{ uuid: string }>(
        "select uuid from purchase_capability.purchases order by created_at limit 1",
      )
    ).rows[0]!.uuid;
    const root = await container.authentication.register({
      email: `purchase-delete-root-${Date.now()}@example.test`,
      username: `purchaseroot${Date.now()}`,
      password: "correct-horse-battery",
      country: "NG",
    });
    await container.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [root.id],
    );
    const outcome = await new OperatorBulkWorkflow(container).execute(root, {
      resource: "purchases",
      action: "delete",
      ids: [id],
    });

    expect(outcome).toEqual({ succeeded: [id], failed: [] });
    expect(
      await container.database.query("select 1 from purchase_capability.purchases where uuid=$1", [
        id,
      ]),
    ).toMatchObject({ rows: [] });
    expect(
      await container.database.query(
        "select 1 from kernel.audit_records where action='root.delete' and subject_type='purchase' and subject_id=$1",
        [id],
      ),
    ).toMatchObject({ rowCount: 1 });
  });
});

import { Pool } from "pg";
import { newId } from "@/kernel/ids";
import { Account } from "@/modules/identity/account";
import { getContainer } from "@/infrastructure/container";
import { fixturePng } from "./fixture-media";

if (process.env.NODE_ENV === "production")
  throw new Error("Catalogue fixtures are development-only");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl });
const ownerId = "00000000-0000-4000-8000-000000000001";
const records = [
  [
    "toolkit-01",
    "Focus workspace starter",
    "# Focus workspace starter\n\nA compact digital workspace for planning a **calmer week**. Map the work that matters, keep notes beside decisions, and give each day a clear next step.\n\n## What is included\n\n- focused planning templates for a busy week\n- a lightweight review ritual for decisions\n- prompts for turning intentions into next actions\n\nIt is designed for people who want useful structure without another complicated project-management system. Start with the [weekly planning guide](https://example.test/guides/weekly-planning), then adapt the templates to your own rhythm.",
    "1200",
  ],
  [
    "toolkit-02",
    "The very long title for a catalogue listing that should wrap cleanly on small screens",
    "A deliberately long description to exercise responsive cards and detail layouts without changing listing semantics.",
    "1800",
  ],
  [
    "toolkit-03",
    "Practical API patterns",
    "A concise guide to designing dependable APIs, with examples that make trade-offs easier to discuss.\n\nWork through resource boundaries, validation, pagination, error responses, and idempotency using small, production-minded examples. Each chapter ends with a checklist you can use during design review.\n\nThe material is suitable for engineers joining an existing service as well as teams starting a new internal API.",
    "2400",
  ],
  [
    "toolkit-04",
    "Creator template pack",
    "Reusable templates for briefs, launches and retrospectives.",
    "900",
  ],
  [
    "toolkit-05",
    "Remote workshop kit",
    "Exercises and facilitation notes for distributed teams.",
    "3200",
  ],
  [
    "toolkit-06",
    "Readable docs course",
    "A self-paced course on useful technical writing for product and engineering teams.\n\nYou will practice turning implementation details into clear explanations, choosing examples that answer real reader questions, and maintaining documentation as a product changes. Short exercises build toward a small documentation set you can adapt to your own work.\n\nThe course includes review prompts for improving tone, structure, and accessibility without flattening the writer's voice.",
    "4500",
  ],
  ["toolkit-07", "Design asset essentials", "A focused collection of interface assets.", "1500"],
  [
    "toolkit-08",
    "Community access pass",
    "A private learning community and monthly sessions.",
    "700",
  ],
  [
    "toolkit-09",
    "Growth research notes",
    "Field notes for thoughtful, permission-based growth.",
    "2100",
  ],
  ["toolkit-10", "Product discovery cards", "A printable set of discovery prompts.", "1100"],
  [
    "toolkit-11",
    "Service reliability basics",
    "Practical incident and reliability foundations for teams that need a calmer way to operate services.\n\nLearn how to define useful service signals, write an incident plan, separate mitigation from follow-up work, and capture decisions while the context is fresh. The handbook uses approachable scenarios rather than assuming a large operations department.\n\nUse it as a starting point for a service review, an onboarding session, or a small team's first on-call agreement.",
    "3800",
  ],
  ["toolkit-12", "Launch checklist", "A short checklist for a confident launch.", "600"],
  ["toolkit-13", "Operations handbook", "A long-form handbook for small product teams.", "5200"],
  [
    "toolkit-14",
    "Research interview guide",
    "Questions and synthesis prompts for interviews.",
    "1300",
  ],
  ["toolkit-15", "Visual storytelling lab", "Exercises for clearer product stories.", "2700"],
  [
    "toolkit-16",
    "Archive example listing",
    "A fixture that demonstrates archived catalogue state.",
    "1000",
  ],
];

try {
  await pool.query("begin");
  await pool.query(
    `insert into identity_capability.accounts(id,email,handle,display_name) values($1,$2,$3,$4) on conflict (id) do nothing`,
    [ownerId, "fixtures.catalogue@example.test", "fixture_catalogue", "Development Catalogue"],
  );
  for (const [key, title, description, price] of records) {
    const state = key === "toolkit-16" ? "archived" : key === "toolkit-15" ? "draft" : "published";
    await pool.query(
      `insert into listing_capability.listings(id,seller_id,title,description,price_minor,price_currency,destination_url,state,metadata,external_key) values($1,$2,$3,$4,$5,'USD',$6,$7,$8::jsonb,$9) on conflict (seller_id,external_key) do update set title=excluded.title,description=excluded.description,price_minor=excluded.price_minor,state=excluded.state,metadata=excluded.metadata,created_at=case when excluded.external_key in ('toolkit-01','toolkit-02') then now() else listing_capability.listings.created_at end,updated_at=now()`,
      [
        newId(),
        ownerId,
        title,
        description,
        price,
        `https://example.test/catalogue/${key}`,
        state,
        JSON.stringify({
          category: key.includes("toolkit") ? "Toolkit" : "Resources",
          fixture: true,
        }),
        key,
      ],
    );
  }
  await pool.query("commit");
  const mediaFixtures = [
    ["toolkit-01", "workspace-cover.png", "Workspace starter cover", [35, 120, 95]],
    ["toolkit-02", "api-patterns-cover.png", "API patterns cover", [40, 90, 160]],
    ["toolkit-02", "api-patterns-detail.png", "API patterns detail", [190, 120, 40]],
    ["toolkit-06", "docs-course-cover.png", "Docs course cover", [95, 70, 145]],
  ] as const;
  const desiredTransferIdentities = new Set(
    mediaFixtures.map(([key, filename]) => `catalogue-fixture:v2:${key}:${filename}`),
  );
  const container = getContainer();
  const owner = new Account(ownerId, "fixtures.catalogue@example.test", "fixture_catalogue");
  for (const [key, filename, altText, color] of mediaFixtures) {
    const listing = (
      await pool.query<{ id: string }>(
        `select id from listing_capability.listings where seller_id=$1 and external_key=$2`,
        [ownerId, key],
      )
    ).rows[0];
    if (!listing) continue;
    const transferIdentity = `catalogue-fixture:v2:${key}:${filename}`;
    const listingMedia = await container.listingMediaRepository.listByListing(listing.id);
    for (const media of listingMedia) {
      if (
        media.state === "active" &&
        media.transferIdentity?.startsWith("catalogue-fixture:") &&
        !desiredTransferIdentities.has(media.transferIdentity)
      ) {
        await container.listingMedia.requestDeletionCatalogue(owner, listing.id, media.id);
      }
    }
    const existing = listingMedia.find(
      (media) => media.state === "active" && media.transferIdentity === transferIdentity,
    );
    let stored = true;
    if (existing?.storageProvider === "filesystem") {
      const provider = container.objectStorage.get(existing.storageProvider);
      if (provider.read) {
        try {
          await provider.read({
            provider: existing.storageProvider,
            container: existing.storageContainer,
            key: existing.objectKey,
          });
        } catch {
          stored = false;
        }
      }
    }
    if (existing && !stored)
      await container.listingMedia.requestDeletionCatalogue(owner, listing.id, existing.id);
    if (!existing || !stored) {
      await container.listingMedia.createCatalogue(owner, listing.id, {
        bytes: fixturePng(color[0], color[1], color[2]),
        mimeType: "image/png",
        filename,
        altText,
        transferIdentity,
      });
    }
  }
  await container.authentication.betterAuth.close();
  await container.database.close();
  console.log(`Seeded ${records.length} development catalogue listings.`);
} catch (error) {
  await pool.query("rollback");
  throw error;
} finally {
  await pool.end();
}

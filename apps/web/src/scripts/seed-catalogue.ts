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
  [
    "toolkit-17",
    "Customer research board",
    "A structured board for turning interview notes into useful product decisions.",
    "1900",
  ],
  [
    "toolkit-18",
    "Independent consultant kit",
    "A practical set of proposal, discovery and handover resources for independent consultants.",
    "2900",
  ],
  [
    "toolkit-19",
    "Team retro cards",
    "Prompts that help teams discuss what changed, what helped and what to try next.",
    "800",
  ],
  [
    "toolkit-20",
    "Analytics question bank",
    "A focused reference for asking better questions before opening a dashboard.",
    "1700",
  ],
  [
    "toolkit-21",
    "Product narrative workshop",
    "A guided workshop for connecting customer context, product choices and launch communication.",
    "3400",
  ],
  [
    "toolkit-22",
    "Practical accessibility review",
    "A clear checklist and examples for reviewing everyday interface decisions.",
    "1600",
  ],
  [
    "toolkit-23",
    "Founder operating notes",
    "Planning notes for small teams building an intentional operating rhythm.",
    "2200",
  ],
  [
    "toolkit-24",
    "Service blueprint starter",
    "Maps and facilitation prompts for understanding a service from end to end.",
    "2600",
  ],
  [
    "toolkit-25",
    "Writing system templates",
    "Templates for content planning, review and publication workflows.",
    "1400",
  ],
  [
    "toolkit-26",
    "Customer support playbook",
    "A lightweight support playbook for early product teams.",
    "3100",
  ],
  [
    "toolkit-27",
    "Strategy memo collection",
    "Examples and prompts for making decisions legible across a growing team.",
    "3600",
  ],
  [
    "toolkit-28",
    "Better meetings guide",
    "Practical preparation and facilitation guidance for shorter, more useful meetings.",
    "1000",
  ],
  [
    "toolkit-29",
    "API onboarding pack",
    "Examples and exercises for making an API easier to adopt.",
    "2300",
  ],
];

try {
  await pool.query("begin");
  await pool.query(
    `insert into identity_capability.accounts(uuid,email,handle,display_name) values($1,$2,$3,$4) on conflict (uuid) do nothing`,
    [ownerId, "fixtures.catalogue@example.test", "fixture_catalogue", "Development Catalogue"],
  );
  for (const [key, title, description, price] of records) {
    const state = key === "toolkit-16" ? "archived" : key === "toolkit-15" ? "draft" : "published";
    const numericKey = Number(key.slice(-2));
    const featuredPosition = [1, 2, 3, 6, 11, 18].indexOf(numericKey) + 1 || null;
    const createdAt = new Date(Date.UTC(2025, 0, 1 + numericKey)).toISOString();
    await pool.query(
      `insert into listing_capability.listings(uuid,seller_id,title,description,price_minor,price_currency,destination_url,state,metadata,external_key,featured_position,created_at,updated_at) values($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,'USD',$6,$7,$8::jsonb,$9,$10,$11,$11) on conflict (seller_id,external_key) do update set title=excluded.title,description=excluded.description,price_minor=excluded.price_minor,state=excluded.state,metadata=excluded.metadata,featured_position=excluded.featured_position,created_at=excluded.created_at,updated_at=excluded.updated_at`,
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
        featuredPosition,
        createdAt,
      ],
    );
  }
  await pool.query("commit");
  const reviewers = [
    ["00000000-0000-4000-8000-000000000011", "fixtures.reviewer.one@example.test", "reviewer_one"],
    ["00000000-0000-4000-8000-000000000012", "fixtures.reviewer.two@example.test", "reviewer_two"],
    [
      "00000000-0000-4000-8000-000000000013",
      "fixtures.reviewer.three@example.test",
      "reviewer_three",
    ],
  ] as const;
  for (const [id, email, handle] of reviewers)
    await pool.query(
      `insert into identity_capability.accounts(uuid,email,handle,display_name) values($1,$2,$3,$3) on conflict(uuid) do update set handle=excluded.handle`,
      [id, email, handle],
    );
  const reviewFixtures = [
    [
      "toolkit-01",
      reviewers[0][0],
      5,
      "A calm, useful workspace that was easy to adapt.",
      "approved",
    ],
    [
      "toolkit-01",
      reviewers[1][0],
      4,
      "Helpful prompts without unnecessary complexity.",
      "approved",
    ],
    [
      "toolkit-02",
      reviewers[2][0],
      5,
      "The examples made the ideas immediately practical.",
      "approved",
    ],
    [
      "toolkit-03",
      reviewers[0][0],
      4,
      "A concise reference for our API design review.",
      "approved",
    ],
    ["toolkit-06", reviewers[1][0], 5, "", "approved"],
    [
      "toolkit-11",
      reviewers[2][0],
      3,
      "Useful material, still working through the exercises.",
      "pending",
    ],
    ["toolkit-18", reviewers[0][0], 2, "Not the right fit for my team.", "rejected"],
  ] as const;
  for (const [key, accountId, rating, body, status] of reviewFixtures) {
    const listing = (
      await pool.query<{ id: string }>(
        `select uuid as id from listing_capability.listings where seller_id=(select id from identity_capability.accounts where uuid=$1) and external_key=$2`,
        [ownerId, key],
      )
    ).rows[0];
    if (!listing) continue;
    await pool.query(
      `insert into listing_capability.reviews(uuid,listing_id,account_id,rating,body,status,moderated_at,moderated_by)
       values(gen_random_uuid(),(select id from listing_capability.listings where uuid=$1),(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,case when $5='pending' then null else '2025-02-01T00:00:00.000Z'::timestamptz end,case when $5='pending' then null else (select id from identity_capability.accounts where uuid=$2) end)
       on conflict(listing_id,account_id) do update set rating=excluded.rating,body=excluded.body,status=excluded.status,moderated_at=excluded.moderated_at,moderated_by=excluded.moderated_by,updated_at=now()`,
      [listing.id, accountId, rating, body, status],
    );
  }
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
        `select uuid as id from listing_capability.listings where seller_id=(select id from identity_capability.accounts where uuid=$1) and external_key=$2`,
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

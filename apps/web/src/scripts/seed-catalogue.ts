import { Pool } from "pg";
import { newId } from "@/kernel/ids";

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
    "A compact digital workspace for planning a calmer week.",
    "1200",
  ],
  [
    "toolkit-02",
    "The very long title for a catalogue listing that should wrap cleanly on small screens",
    "A deliberately long description to exercise responsive cards and detail layouts without changing listing semantics.",
    "1800",
  ],
  ["toolkit-03", "Practical API patterns", "A concise guide to designing dependable APIs.", "2400"],
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
    "A self-paced course on useful technical writing.",
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
    "Practical incident and reliability foundations.",
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
      `insert into listing_capability.listings(id,seller_id,title,description,price_minor,price_currency,destination_url,state,metadata,external_key) values($1,$2,$3,$4,$5,'USD',$6,$7,$8::jsonb,$9) on conflict (seller_id,external_key) do update set title=excluded.title,description=excluded.description,price_minor=excluded.price_minor,state=excluded.state,metadata=excluded.metadata,updated_at=now()`,
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
  console.log(`Seeded ${records.length} development catalogue listings.`);
} catch (error) {
  await pool.query("rollback");
  throw error;
} finally {
  await pool.end();
}

/** Stable reviewed private listing kept near the top of the signed-in catalogue. */
export const AUTHENTICATED_REVIEWED_CATALOGUE_FIXTURE = Object.freeze({
  externalKey: "toolkit-08",
  state: "published" as const,
  visibility: "authenticated" as const,
  categorySlugs: ["operations", "product"] as const,
  compareAtPriceMinor: "1500",
  createdAt: "2026-01-01T00:00:00.000Z",
  approvedRating: 5,
});

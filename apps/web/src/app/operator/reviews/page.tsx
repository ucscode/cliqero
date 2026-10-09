import { OperatorReviews } from "@/components/operator/reviews";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export default async function OperatorReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string }>;
}) {
  const params = await searchParams;
  const access = await requireOperatorPage("/operator/reviews");
  return (
    <OperatorShell {...access} activeSection="reviews">
      <OperatorReviews
        capabilities={access.capabilities}
        initialListingId={params.listing ?? ""}
        canDelete={hasCapability(access.capabilities, "reviews.moderate")}
      />
    </OperatorShell>
  );
}

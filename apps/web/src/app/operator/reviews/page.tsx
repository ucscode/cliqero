import { OperatorReviews } from "@/components/operator/reviews";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../operator-access";

export default async function OperatorReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string }>;
}) {
  const params = await searchParams;
  const access = await requireOperatorPage("/operator/reviews");
  return (
    <OperatorShell {...access} activeSection="reviews">
      <OperatorReviews initialListingId={params.listing ?? ""} />
    </OperatorShell>
  );
}

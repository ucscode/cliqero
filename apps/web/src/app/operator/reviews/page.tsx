import { OperatorReviews } from "@/components/operator-reviews";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../operator-access";

export default async function OperatorReviewsPage() {
  const access = await requireOperatorPage("/operator/reviews");
  return (
    <OperatorShell {...access} activeSection="reviews" title="Reviews">
      <OperatorReviews />
    </OperatorShell>
  );
}

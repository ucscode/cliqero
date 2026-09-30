import { OperatorReviewEditor } from "@/components/operator/reviews";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";

export default async function OperatorReviewPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const access = await requireOperatorPage(`/operator/reviews/${encodeURIComponent(reviewId)}`);
  return (
    <OperatorShell {...access} activeSection="reviews">
      <OperatorReviewEditor reviewId={reviewId} />
    </OperatorShell>
  );
}

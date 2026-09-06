import { OperatorReviews } from "@/components/operator-reviews";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../operator-access";
import { redirect } from "next/navigation";

export default async function OperatorReviewsPage() {
  const access = await requireOperatorPage("/operator/reviews");
  if (access.role !== "operator") redirect("/operator");
  return (
    <OperatorShell {...access} activeSection="reviews" title="Reviews">
      <OperatorReviews />
    </OperatorShell>
  );
}

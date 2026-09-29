export const operatorReviewOpenApiMetadata = [
  {
    path: "/api/operator/reviews/{reviewId}",
    method: "patch",
    mode: "account",
    scope: "reviews:moderate",
  },
] as const;

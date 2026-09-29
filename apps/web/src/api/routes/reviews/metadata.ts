export const operatorReviewOpenApiMetadata = [
  {
    path: "/api/reviews/{reviewId}",
    method: "patch",
    mode: "account",
    scope: "reviews:moderate",
  },
] as const;

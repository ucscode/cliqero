export const operatorReviewOpenApiMetadata = [
  {
    path: "/api/reviews",
    method: "get",
    mode: "account",
    scope: "reviews:moderate",
    capability: "reviews.moderate",
  },
  {
    path: "/api/reviews",
    method: "post",
    mode: "session_only",
    apiKey: "reject",
  },
  {
    path: "/api/reviews/{reviewId}",
    method: "get",
    mode: "account",
    scope: "reviews:moderate",
    capability: "reviews.moderate",
  },
  {
    path: "/api/reviews/{reviewId}",
    method: "patch",
    mode: "account",
    scope: "reviews:moderate",
  },
  {
    path: "/api/reviews",
    method: "delete",
    mode: "account",
    scope: "reviews:moderate",
    capability: "reviews.moderate",
  },
] as const;

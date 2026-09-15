export function reviewJson(review: any, options: { reviewer?: string; isMine?: boolean } = {}) {
  return {
    id: review.id,
    listing_id: review.listingId,
    rating: review.rating,
    body: review.body,
    status: review.status,
    created_at: review.createdAt.toISOString(),
    updated_at: review.updatedAt.toISOString(),
    moderated_at: review.moderatedAt?.toISOString() ?? null,
    ...((options.reviewer ?? review.reviewer)
      ? { reviewer: options.reviewer ?? review.reviewer }
      : {}),
    ...(options.isMine ? { is_mine: true } : {}),
    ...(review.listingTitle ? { listing_title: review.listingTitle } : {}),
  };
}

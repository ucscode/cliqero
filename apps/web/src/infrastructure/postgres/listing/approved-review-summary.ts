/** Shared approved-review aggregate used by storefront display and ordering. */
export const approvedReviewSummaryCte = `approved_review_summary as (
  select r.listing_id,round(avg(r.rating)::numeric,2) as average_rating,count(*)::bigint as approved_count
  from listing_capability.reviews r
  where r.status='approved'
  group by r.listing_id
)`;

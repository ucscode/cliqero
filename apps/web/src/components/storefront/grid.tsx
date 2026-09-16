import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { ListingCard } from "../listing/card";
import type { Listing } from "@/lib/api-client";

export function ListingGrid({
  listings,
  reviewsVisible,
}: {
  listings: Listing[];
  reviewsVisible: boolean;
}) {
  return (
    <div className="grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing) => (
        <ListingCard listing={listing} key={listing.id} reviewsVisible={reviewsVisible} />
      ))}
    </div>
  );
}

export function LoadingGrid() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <Card key={index} className="overflow-hidden">
          <Skeleton className="aspect-[1.34] rounded-none" />
          <div className="grid gap-3 p-5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </Card>
      ))}
    </div>
  );
}

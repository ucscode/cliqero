/* eslint-disable @next/next/no-img-element -- storage provider URLs are runtime-configured. */
import Link from "next/link";
import type { Listing } from "@/lib/api-client";
import { Badge, Card, Money } from "./ui";

export function ListingCard({ listing }: { listing: Listing }) {
  const image = listing.media[0];
  return (
    <Card className="listing-card">
      <Link href={`/listings/${listing.id}`} className="listing-image-link">
        {image ? (
          <img src={image.url} alt={image.alt_text || listing.title} className="listing-image" />
        ) : (
          <div className="listing-image placeholder-image">
            <span>{listing.title.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
      </Link>
      <div className="listing-card-body">
        <div className="card-kicker">
          <Badge tone="accent">Featured</Badge>
          <span>Cliqero catalogue</span>
        </div>
        <h3>
          <Link href={`/listings/${listing.id}`}>{listing.title}</Link>
        </h3>
        <p>{listing.description || "A considered way to move forward."}</p>
        <div className="listing-card-foot">
          <Money minor={listing.price.minor_amount} currency={listing.price.currency} />
          <Link className="arrow-link" href={`/listings/${listing.id}`}>
            View <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </Card>
  );
}

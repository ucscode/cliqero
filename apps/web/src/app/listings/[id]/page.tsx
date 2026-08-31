import { notFound } from "next/navigation";
import { getContainer } from "@/infrastructure/container";

export default async function PublicListingPage({ params }: { params: Promise<{ id: string }> }) {
  const listing = await getContainer().listingService.getPublic((await params).id);
  if (!listing) notFound();
  return (
    <main>
      <p className="eyebrow">Listing</p>
      <h1>{listing.title}</h1>
      <p>{listing.description}</p>
      <p>
        {listing.price.currency} {listing.price.minorAmount.toString()} minor units
      </p>
    </main>
  );
}

import { SiteHeader } from "@/components/site-header";
import { ListingDetail } from "@/components/listing-detail";

export default async function PublicListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <SiteHeader />
      <ListingDetail id={id} />
    </>
  );
}

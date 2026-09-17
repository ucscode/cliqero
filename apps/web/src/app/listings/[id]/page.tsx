import { SiteHeader } from "@/components/site/header";
import { ListingDetail } from "@/components/listing/detail";
import { loadStorefrontConfiguration } from "@/config/storefront";

export default async function PublicListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const storefrontConfig = loadStorefrontConfiguration();
  return (
    <>
      <SiteHeader />
      <ListingDetail id={id} reviewsVisible={storefrontConfig.reviews.visible} />
    </>
  );
}

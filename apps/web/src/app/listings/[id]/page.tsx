import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { ListingDetail } from "@/components/listing/detail";
import { loadStorefrontConfiguration } from "@/config/storefront";

export default async function PublicListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { id } = await params;
  const { preview } = await searchParams;
  const storefrontConfig = loadStorefrontConfiguration();
  return (
    <>
      <SiteHeader />
      <ListingDetail
        id={id}
        previewToken={preview}
        reviewsVisible={storefrontConfig.reviews.visible}
      />
      <SiteFooter />
    </>
  );
}

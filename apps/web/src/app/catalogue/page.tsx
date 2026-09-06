import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Storefront, StorefrontFallback } from "@/components/storefront";
import { storefrontConfig } from "@/config/storefront";

export default function CataloguePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-screen max-w-[1240px] px-4 py-10 sm:px-8 sm:py-14">
        <Suspense fallback={<StorefrontFallback />}>
          <Storefront reviewsVisible={storefrontConfig.reviews.visible} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

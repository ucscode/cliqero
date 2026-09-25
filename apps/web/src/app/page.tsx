import Link from "next/link";
import { SiteHeader } from "@/components/site/header";
import { FeaturedStorefront } from "@/components/storefront";
import { SiteFooter } from "@/components/site/footer";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { loadStorefrontConfiguration } from "@/config/storefront";

export default function Home() {
  const storefrontConfig = loadStorefrontConfiguration();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-8">
        <section className="py-12">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Digital products, one catalogue
          </p>
          <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-tight text-slate-900">
            Find something useful. Make it yours.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Explore digital products from the {siteConfig.name} catalogue, choose what fits what you
            need, and keep access to your purchases in one account.
          </p>
          <Button asChild className="mt-6">
            <Link href="/catalogue">Browse catalogue</Link>
          </Button>
        </section>
        <FeaturedStorefront reviewsVisible={storefrontConfig.reviews.visible} />
      </main>
      <SiteFooter />
    </>
  );
}

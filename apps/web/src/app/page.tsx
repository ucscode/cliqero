import { SiteHeader } from "@/components/site-header";
import { FeaturedStorefront } from "@/components/storefront";
import { SiteFooter } from "@/components/site-footer";
import { siteConfig } from "@/config/site";
import { storefrontConfig } from "@/config/storefront";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-8">
        <section className="py-12">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Discover and access
          </p>
          <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-tight text-slate-900">
            Discover useful things worth making yours.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Browse practical digital resources from the {siteConfig.name} catalogue, then purchase
            and access what helps you move forward.
          </p>
        </section>
        <FeaturedStorefront reviewsVisible={storefrontConfig.reviews.visible} />
      </main>
      <SiteFooter />
    </>
  );
}

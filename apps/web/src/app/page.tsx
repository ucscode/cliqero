import { SiteHeader } from "@/components/site-header";
import { Storefront } from "@/components/storefront";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-8">
        <Storefront />
      </main>
    </>
  );
}

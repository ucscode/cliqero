import { SiteHeader } from "@/components/site-header";
import { Storefront } from "@/components/storefront";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="site-main">
        <Storefront />
      </main>
    </>
  );
}

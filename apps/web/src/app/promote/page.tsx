import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";
import { siteConfig } from "@/config/site";
export const metadata: Metadata = {
  title: `Promote | ${siteConfig.name}`,
  description: "Learn how catalogue referrals work.",
};
export default function PromotePage() {
  return (
    <PublicPage
      title="Promote useful catalogue listings"
      intro="Promotion is a secondary way to share products you genuinely recommend."
    >
      <section>
        <h2 className="text-2xl font-semibold text-slate-900">How it works</h2>
        <p className="mt-2">
          Some catalogue products can be shared using referral links. You may earn a commission when
          someone makes a qualifying purchase through your link.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold text-slate-900">What it is not</h2>
        <p className="mt-2">
          Clicks alone do not earn commission. Sharing products is optional, and members do not
          create catalogue listings.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold text-slate-900">Get started</h2>
        <p className="mt-2">
          Browse the catalogue and share eligible products if you choose. You can use Cliqero
          without promoting anything.
        </p>
      </section>
    </PublicPage>
  );
}

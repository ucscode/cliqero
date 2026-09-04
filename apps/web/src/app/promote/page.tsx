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
          Eligible members create attributed referral links for catalogue listings. When a referred
          buyer completes a valid purchase, the existing commission policy may create an earnings
          entry.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold text-slate-900">What it is not</h2>
        <p className="mt-2">
          Clicks and page views do not create commissions. There are no recruitment fees, and
          ordinary members do not create catalogue listings.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold text-slate-900">Get started</h2>
        <p className="mt-2">
          Create an account, explore the catalogue, and use the Promote tools when a listing is
          eligible. Earnings move through the normal pending and settlement lifecycle.
        </p>
      </section>
    </PublicPage>
  );
}

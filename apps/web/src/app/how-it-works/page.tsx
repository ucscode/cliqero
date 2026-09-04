import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";
import { siteConfig } from "@/config/site";
export const metadata: Metadata = {
  title: `How ${siteConfig.name} works`,
  description: `Discover, fund, buy, access and promote on ${siteConfig.name}.`,
};
export default function HowItWorks() {
  return (
    <PublicPage
      title={`How ${siteConfig.name} works`}
      intro="A catalogue, wallet and referral experience built around access to useful digital products."
    >
      <section>
        <h2 className="text-2xl font-semibold text-slate-900">The product loop</h2>
        <p className="mt-2">
          Discover catalogue listings, fund your wallet, buy what you need, and access your
          purchase. Members can promote catalogue listings and earn qualifying referral commissions.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold text-slate-900">The money loop</h2>
        <p className="mt-2">
          Fund → Wallet → Buy → Commission and platform revenue. Wallet deposits fund a buyer
          wallet; they do not directly purchase a listing.
        </p>
      </section>
    </PublicPage>
  );
}

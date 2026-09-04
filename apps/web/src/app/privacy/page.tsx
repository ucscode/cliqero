import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";
import { siteConfig } from "@/config/site";
export const metadata: Metadata = {
  title: `Privacy | ${siteConfig.name}`,
  description: `${siteConfig.name} privacy information.`,
};
export default function Privacy() {
  return (
    <PublicPage
      title="Privacy"
      intro={`This page is a clear, review-ready summary of how ${siteConfig.name} approaches information. It is not legal advice.`}
    >
      <section>
        <h2 className="text-xl font-semibold text-slate-900">Information we use</h2>
        <p className="mt-2">
          {siteConfig.name} uses account, profile, purchase, wallet and referral information to
          provide the service, protect accounts, and support access. Payment providers process
          provider-side payment details according to their own policies.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold text-slate-900">Your choices</h2>
        <p className="mt-2">
          Contact support for questions about your account information. Final retention, rights and
          regional requirements are subject to legal review and applicable law.
        </p>
      </section>
    </PublicPage>
  );
}

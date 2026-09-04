import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";
import { siteConfig } from "@/config/site";
export const metadata: Metadata = {
  title: `Contact ${siteConfig.name}`,
  description: `Contact ${siteConfig.name} support.`,
};
export default function Contact() {
  return (
    <PublicPage
      title={`Contact ${siteConfig.name}`}
      intro="We are here to help with account, catalogue, wallet and access questions."
    >
      <section>
        <h2 className="text-2xl font-semibold text-slate-900">Support</h2>
        <p className="mt-2">
          Email{" "}
          <a
            className="font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            href={`mailto:${siteConfig.supportEmail}`}
          >
            {siteConfig.supportEmail}
          </a>{" "}
          with your account username and a clear description of the issue. Never send a password,
          API key or payment secret.
        </p>
      </section>
    </PublicPage>
  );
}

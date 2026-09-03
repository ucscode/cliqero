import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";
export const metadata: Metadata = {
  title: "Contact Cliqero",
  description: "Contact Cliqero support.",
};
export default function Contact() {
  return (
    <PublicPage
      title="Contact Cliqero"
      intro="We are here to help with account, catalogue, wallet and access questions."
    >
      <section>
        <h2 className="text-2xl font-semibold text-slate-900">Support</h2>
        <p className="mt-2">
          Email{" "}
          <a className="text-emerald-700 underline" href="mailto:support@cliqero.com">
            support@cliqero.com
          </a>{" "}
          with your account handle and a clear description of the issue. Never send a password, API
          key or payment secret.
        </p>
      </section>
    </PublicPage>
  );
}

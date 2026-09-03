import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";
export const metadata: Metadata = {
  title: "Terms | Cliqero",
  description: "Cliqero terms information.",
};
export default function Terms() {
  return (
    <PublicPage
      title="Terms of use"
      intro="These plain-language terms are a review-ready starting point and are not a substitute for legal advice."
    >
      <section>
        <h2 className="text-xl font-semibold text-slate-900">Using Cliqero</h2>
        <p className="mt-2">
          Use an account you control, keep credentials safe, and use catalogue, wallet, referral and
          access features only as intended. Do not misuse referral links, payment providers, or
          another member&apos;s account.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold text-slate-900">Updates and support</h2>
        <p className="mt-2">
          Product policies may evolve. We will communicate material changes through appropriate
          product channels. Contact support with questions before relying on a policy detail.
        </p>
      </section>
    </PublicPage>
  );
}

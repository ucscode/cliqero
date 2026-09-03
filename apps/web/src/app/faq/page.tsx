import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";
export const metadata: Metadata = {
  title: "Cliqero FAQ",
  description: "Answers about buying, wallet funding and referrals on Cliqero.",
};
export default function Faq() {
  const items = [
    [
      "What is Cliqero?",
      "Cliqero is a catalogue and access platform. You can discover products, fund a buyer wallet, purchase access and promote listings.",
    ],
    [
      "How does funding work?",
      "External providers fund your Cliqero wallet. A successful funding transaction is separate from a later wallet purchase.",
    ],
    [
      "How do referrals work?",
      "Authenticated members may create referral links and earn qualifying commissions when the existing attribution and distribution rules apply.",
    ],
    [
      "Can I withdraw earnings?",
      "Eligible earnings follow the current settlement and withdrawal policies shown in your signed-in dashboard.",
    ],
    [
      "What account do I need?",
      "Create an account and complete the required onboarding information. Your account controls the areas available to you.",
    ],
  ];
  return (
    <PublicPage
      title="Frequently asked questions"
      intro="Clear answers to common Cliqero questions."
    >
      {items.map(([q, a]) => (
        <section key={q}>
          <h2 className="text-xl font-semibold text-slate-900">{q}</h2>
          <p className="mt-2">{a}</p>
        </section>
      ))}
    </PublicPage>
  );
}

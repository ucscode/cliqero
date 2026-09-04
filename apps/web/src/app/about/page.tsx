import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";
import { siteConfig } from "@/config/site";
export const metadata: Metadata = {
  title: `About ${siteConfig.name}`,
  description: `Learn about ${siteConfig.name}'s catalogue and referral model.`,
};
export default function About() {
  return (
    <PublicPage
      title={`About ${siteConfig.name}`}
      intro={`${siteConfig.name} provides a catalogue-led way to discover digital products and share them with people you know.`}
    >
      <p>
        {siteConfig.name} owns and provides the catalogue. Ordinary members are buyers and
        promoters, not sellers. We keep wallet funding, purchases, access and referral earnings as
        separate product concepts so each remains clear.
      </p>
      <p>
        Our goal is a straightforward path from discovering something useful to getting access, with
        transparent referral attribution for qualifying promotion.
      </p>
    </PublicPage>
  );
}

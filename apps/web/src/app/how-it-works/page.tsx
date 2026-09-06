import type { Metadata } from "next";
import { InformationalContentPage } from "@/components/informational-content-page";
import { siteConfig } from "@/config/site";
import HowItWorksContent from "../../../../../content/pages/how-it-works.mdx";
import { loadInformationalPageMetadata } from "@/content/informational-pages";

const page = loadInformationalPageMetadata("how-it-works");

export const metadata: Metadata = {
  title: `${page.title} | ${siteConfig.name}`,
  ...(page.description ? { description: page.description } : {}),
};

export default function HowItWorks() {
  return (
    <InformationalContentPage page={page}>
      <HowItWorksContent />
    </InformationalContentPage>
  );
}

import type { Metadata } from "next";
import { InformationalContentPage } from "@/components/informational-content-page";
import { siteConfig } from "@/config/site";
import PrivacyContent from "../../../../../content/pages/privacy.mdx";
import { loadInformationalPageMetadata } from "@/content/informational-pages";

const page = loadInformationalPageMetadata("privacy");

export const metadata: Metadata = {
  title: `${page.title} | ${siteConfig.name}`,
  ...(page.description ? { description: page.description } : {}),
};

export default function Privacy() {
  return (
    <InformationalContentPage page={page}>
      <PrivacyContent />
    </InformationalContentPage>
  );
}

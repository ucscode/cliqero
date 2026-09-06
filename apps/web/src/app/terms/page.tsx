import type { Metadata } from "next";
import { InformationalContentPage } from "@/components/informational-content-page";
import { siteConfig } from "@/config/site";
import TermsContent from "../../../../../content/pages/terms.mdx";
import { loadInformationalPageMetadata } from "@/content/informational-pages";

const page = loadInformationalPageMetadata("terms");

export const metadata: Metadata = {
  title: `${page.title} | ${siteConfig.name}`,
  ...(page.description ? { description: page.description } : {}),
};

export default function Terms() {
  return (
    <InformationalContentPage page={page}>
      <TermsContent />
    </InformationalContentPage>
  );
}

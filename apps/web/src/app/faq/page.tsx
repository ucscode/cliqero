import type { Metadata } from "next";
import { InformationalContentPage } from "@/components/informational-content-page";
import { siteConfig } from "@/config/site";
import FaqContent from "../../../../../content/pages/faq.mdx";
import { loadInformationalPageMetadata } from "@/content/informational-pages";

const page = loadInformationalPageMetadata("faq");

export const metadata: Metadata = {
  title: `${page.title} | ${siteConfig.name}`,
  ...(page.description ? { description: page.description } : {}),
};

export default function Faq() {
  return (
    <InformationalContentPage page={page}>
      <FaqContent />
    </InformationalContentPage>
  );
}

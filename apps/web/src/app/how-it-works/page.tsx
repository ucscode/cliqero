import type { Metadata } from "next";
import { InformationalContentPage } from "@/components/informational-content-page";
import { siteConfig } from "@/config/site";
import { loadInformationalPage } from "@/content/informational-pages";

const page = loadInformationalPage("how-it-works");

export const metadata: Metadata = {
  title: `${page.title} | ${siteConfig.name}`,
  ...(page.description ? { description: page.description } : {}),
};

export default function HowItWorks() {
  return <InformationalContentPage page={page} />;
}

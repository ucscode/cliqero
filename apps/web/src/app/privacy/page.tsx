import type { Metadata } from "next";
import { InformationalContentPage } from "@/components/informational-content-page";
import { siteConfig } from "@/config/site";
import { loadInformationalPage } from "@/content/informational-pages";

const page = loadInformationalPage("privacy");

export const metadata: Metadata = {
  title: `${page.title} | ${siteConfig.name}`,
  ...(page.description ? { description: page.description } : {}),
};

export default function Privacy() {
  return <InformationalContentPage page={page} />;
}

import type { Metadata } from "next";
import { InformationalContentPage } from "@/components/informational-content-page";
import { siteConfig } from "@/config/site";
import { loadInformationalPage } from "@/content/informational-pages";

const page = loadInformationalPage("about");

export const metadata: Metadata = {
  title: `${page.title} | ${siteConfig.name}`,
  ...(page.description ? { description: page.description } : {}),
};

export default function About() {
  return <InformationalContentPage page={page} />;
}

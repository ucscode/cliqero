import { InformationalContentPage } from "@/components/informational-content-page";
import { loadContentDocument } from "@/content/loader";

export default async function HowItWorks() {
  const page = await loadContentDocument("pages/how-it-works.mdx");
  return (
    <InformationalContentPage meta={page.meta}>
      <page.Content />
    </InformationalContentPage>
  );
}

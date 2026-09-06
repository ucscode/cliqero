import { InformationalContentPage } from "@/components/informational-content-page";
import { loadContentDocument } from "@/content/loader";

export default async function Faq() {
  const page = await loadContentDocument("pages/faq.mdx");
  return (
    <InformationalContentPage meta={page.meta}>
      <page.Content />
    </InformationalContentPage>
  );
}

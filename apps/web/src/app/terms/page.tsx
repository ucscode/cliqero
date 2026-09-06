import { InformationalContentPage } from "@/components/informational-content-page";
import { loadContentDocument } from "@/content/loader";

export default async function Terms() {
  const page = await loadContentDocument("pages/terms.mdx");
  return (
    <InformationalContentPage meta={page.meta}>
      <page.Content />
    </InformationalContentPage>
  );
}

import { InformationalContentPage } from "@/components/informational-content-page";
import { loadContentDocument } from "@/content/loader";

export default async function Privacy() {
  const page = await loadContentDocument("pages/privacy.mdx");
  return (
    <InformationalContentPage meta={page.meta}>
      <page.Content />
    </InformationalContentPage>
  );
}

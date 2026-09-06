import { InformationalContentPage } from "@/components/informational-content-page";
import { loadContentDocument } from "@/content/loader";

export default async function About() {
  const page = await loadContentDocument("pages/about.mdx");
  return (
    <InformationalContentPage meta={page.meta}>
      <page.Content />
    </InformationalContentPage>
  );
}

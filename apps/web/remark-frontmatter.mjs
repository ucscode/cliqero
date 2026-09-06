import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { frontmatter } from "micromark-extension-frontmatter";

export default function remarkYamlFrontmatter() {
  const data = this.data();
  const micromarkExtensions = (data.micromarkExtensions ??= []);
  const fromMarkdownExtensions = (data.fromMarkdownExtensions ??= []);
  micromarkExtensions.push(frontmatter(["yaml"]));
  fromMarkdownExtensions.push(frontmatterFromMarkdown(["yaml"]));
}

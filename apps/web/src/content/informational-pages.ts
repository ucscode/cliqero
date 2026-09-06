import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import matter from "gray-matter";
import { z } from "zod";

const frontMatterSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  updated: z
    .union([z.string().trim().min(1), z.date()])
    .optional()
    .transform((value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value)),
});

export const informationalPageSlugs = ["about", "faq", "how-it-works", "privacy", "terms"] as const;
export type InformationalPageSlug = (typeof informationalPageSlugs)[number];
export type InformationalPage = Readonly<{
  title: string;
  description?: string;
  updated?: string;
  content: string;
}>;

export function parseInformationalPage(source: string): InformationalPage {
  const parsed = matter(source);
  return { ...frontMatterSchema.parse(parsed.data), content: parsed.content.trim() };
}

export function loadInformationalPage(slug: InformationalPageSlug): InformationalPage {
  const contentDirectory = resolveInformationalContentDirectory();
  return parseInformationalPage(readFileSync(join(contentDirectory, `${slug}.md`), "utf8"));
}

function resolveInformationalContentDirectory() {
  const repositoryRoot = join(process.cwd(), "content", "pages");
  if (existsSync(repositoryRoot)) return repositoryRoot;
  return resolve(process.cwd(), "..", "..", "content", "pages");
}

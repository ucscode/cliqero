import { existsSync, readFileSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import matter from "gray-matter";
import type { ComponentType } from "react";

export type ContentMetadata = Readonly<{
  title?: string;
  description?: string;
  updated?: string;
  [key: string]: unknown;
}>;

export type ContentDocument = Readonly<{
  meta: ContentMetadata;
  Content: ComponentType<Record<string, unknown>>;
}>;

const supportedExtensions = new Set([".md", ".mdx"]);

/**
 * Loads a repository-owned Markdown/MDX document and its front matter as one
 * cohesive document abstraction.
 */
export async function loadContentDocument(contentPath: string): Promise<ContentDocument> {
  const { relativePath, absolutePath } = resolveContentPath(contentPath);
  const source = readFileSync(absolutePath, "utf8");
  const parsed = matter(source);
  const contentModule = (await import(/* @vite-ignore */ `../../content/${relativePath}`)) as {
    default: ComponentType<Record<string, unknown>>;
  };

  return {
    meta: normalizeMetadata(parsed.data as Record<string, unknown>),
    Content: contentModule.default,
  };
}

function normalizeMetadata(data: Record<string, unknown>): ContentMetadata {
  const updated = data.updated;
  return {
    ...data,
    ...(updated instanceof Date ? { updated: updated.toISOString().slice(0, 10) } : {}),
  };
}

function resolveContentPath(contentPath: string) {
  if (!contentPath || isAbsolute(contentPath)) {
    throw new Error(`Content path must be relative to apps/web/content: ${contentPath}`);
  }

  const normalizedPath = contentPath.replaceAll("\\", "/");
  const extension = extname(normalizedPath).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    throw new Error(`Unsupported content extension: ${extension || "(none)"}`);
  }

  const contentRoot = resolveContentRoot();
  const absolutePath = resolve(contentRoot, normalizedPath);
  const relativePath = relative(contentRoot, absolutePath).replaceAll("\\", "/");
  if (relativePath !== normalizedPath || relativePath.startsWith("../")) {
    throw new Error(`Content path escapes apps/web/content: ${contentPath}`);
  }
  if (!existsSync(absolutePath)) {
    throw new Error(`Content document not found: ${contentPath}`);
  }

  return { relativePath, absolutePath };
}

function resolveContentRoot() {
  const candidates = [
    resolve(process.cwd(), "apps/web/content"),
    resolve(process.cwd(), "content"),
    resolve(process.cwd(), "../content"),
  ];
  const contentRoot = candidates.find((candidate) => existsSync(candidate));
  if (!contentRoot) throw new Error("Web content root is missing: apps/web/content");
  return contentRoot;
}

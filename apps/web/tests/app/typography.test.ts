import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("customer typography ownership", () => {
  const styles = readSource("src/app/styles.css");
  const dashboard = readSource("src/components/dashboard/shell.tsx");
  const overview = readSource("src/components/dashboard/overview.tsx");
  const catalogue = readSource("src/components/storefront/catalogue.tsx");

  it("does not impose universal heading size or tracking", () => {
    expect(styles).not.toMatch(/^h1\s*\{/m);
    expect(styles).not.toMatch(/^h2\s*\{/m);
    expect(styles).not.toMatch(/^h3\s*\{/m);
    expect(styles).not.toContain("font-size: clamp(3rem");
  });

  it("keeps informational article heading typography scoped to prose-content", () => {
    expect(styles).toContain(".prose-content h1");
    expect(styles).toContain(".prose-content h2");
    expect(styles).toContain(".prose-content h3");
    expect(styles).toContain(
      ".prose-content h1 {\n  margin: 2.5rem 0 1rem;\n  font-size: 2.25rem;",
    );
    expect(styles).toContain(
      ".prose-content h2 {\n  margin: 2.25rem 0 0.75rem;\n  font-size: 1.75rem;",
    );
    expect(styles).toContain(
      ".prose-content h3 {\n  margin: 1.75rem 0 0.5rem;\n  font-size: 1.375rem;",
    );
    expect(styles).not.toMatch(/\n(?:h1|h2|h3)\s*\{/);
  });

  it("uses the larger scale only for public page titles", () => {
    expect(readSource("src/components/informational-content-page.tsx")).toContain(
      "text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl",
    );
    expect(readSource("src/components/public-page.tsx")).toContain(
      "text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl",
    );
  });

  it("uses the same larger title scale in loaded and fallback catalogue views", () => {
    expect(
      catalogue.match(/className="mb-0 text-5xl font-semibold tracking-tight sm:text-6xl"/g),
    ).toHaveLength(2);
  });

  it("increases the homepage hero while retaining its width and text hierarchy", () => {
    expect(readSource("src/app/page.tsx")).toContain(
      "mt-2 max-w-2xl text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl",
    );
  });

  it("increases only the dashboard shell title, not inner dashboard headings", () => {
    expect(dashboard).toContain("text-4xl font-semibold tracking-tight sm:text-5xl");
    expect(overview).toContain(
      'className="my-2 text-2xl font-semibold tracking-tight">Your collection',
    );
    expect(overview).toContain("my-2 text-3xl font-semibold tracking-tight");
  });

  it("keeps blog and listing content titles at their existing scale", () => {
    expect(catalogue).not.toContain("text-4xl font-semibold tracking-tight sm:text-5xl");
    expect(readSource("src/components/listing/detail.tsx")).toContain(
      "text-4xl font-semibold leading-tight tracking-tight sm:text-5xl",
    );
    expect(readSource("src/app/blog/page.tsx")).toContain(
      "text-5xl font-semibold leading-tight tracking-tight",
    );
  });
});

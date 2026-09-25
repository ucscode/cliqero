import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("customer typography ownership", () => {
  const styles = readSource("src/app/styles.css");
  const dashboard = readSource("src/components/dashboard/shell.tsx");

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
    expect(styles).not.toMatch(/\n(?:h1|h2|h3)\s*\{/);
  });

  it("leaves the dashboard title at its explicit responsive scale", () => {
    expect(dashboard).toContain("text-3xl font-semibold tracking-tight sm:text-4xl");
  });

  it("keeps intentional public hero, catalogue, and blog sizes explicit", () => {
    expect(readSource("src/app/page.tsx")).toContain("text-4xl");
    expect(readSource("src/components/storefront/catalogue.tsx")).toContain(
      "text-4xl font-semibold tracking-tight sm:text-5xl",
    );
    expect(readSource("src/app/blog/page.tsx")).toContain(
      "text-5xl font-semibold leading-tight tracking-tight",
    );
  });
});

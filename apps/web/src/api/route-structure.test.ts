import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const apiRoot = fileURLToPath(new URL("../app/api", import.meta.url));
const allowedRoutes = new Set([
  "[[...route]]/route.ts",
  "auth/[...all]/route.ts",
  "webhooks/paystack/route.ts",
]);

function routeFiles(directory: string, prefix = ""): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry}` : entry;
    const path = resolve(directory, entry);
    return statSync(path).isDirectory()
      ? routeFiles(path, relative)
      : entry === "route.ts"
        ? [relative]
        : [];
  });
}

describe("application API route ownership", () => {
  it("keeps Next.js app/api limited to explicit protocol exceptions and the Hono catch-all", () => {
    expect(routeFiles(apiRoot).sort()).toEqual([...allowedRoutes].sort());
    expect(existsSync(resolve(apiRoot, "gateway/route.ts"))).toBe(false);
    expect(existsSync(fileURLToPath(new URL("../proxy.ts", import.meta.url)))).toBe(false);
  });
});

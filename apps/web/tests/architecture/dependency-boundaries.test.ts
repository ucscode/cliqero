import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(process.cwd(), "src");
const packageRoots = [
  resolve(process.cwd(), "../../packages/payment/paystack/src"),
  resolve(process.cwd(), "../../packages/payment/nowpayments/src"),
  resolve(process.cwd(), "../../packages/blockchain/tron/src"),
];
const codeExtensions = new Set([".ts", ".tsx"]);

function filesUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return codeExtensions.has(path.slice(path.lastIndexOf("."))) ? [path] : [];
  });
}

function importSpecifiers(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specifiers = [
    ...source.matchAll(/(?:import|export)(?:[\s\S]*?from\s*)?(["'])([^"']+)\1/g),
    ...source.matchAll(/import\s*\(\s*(["'])([^"']+)\1\s*\)/g),
    ...source.matchAll(/require\s*\(\s*(["'])([^"']+)\1\s*\)/g),
  ];
  return specifiers.map((match) => match[2]);
}

function resolveImport(file: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return resolve(sourceRoot, specifier.slice(2));
  if (specifier.startsWith(".")) return resolve(dirname(file), specifier);
  return null;
}

function resolveSourceFile(path: string): string | null {
  const candidates = [
    path,
    `${path}.ts`,
    `${path}.tsx`,
    `${path}.js`,
    `${path}.jsx`,
    join(path, "index.ts"),
    join(path, "index.tsx"),
  ];
  return (
    candidates.find((candidate) => existsSync(candidate) && !statSync(candidate).isDirectory()) ??
    null
  );
}

function importViolations(root: string, forbiddenRoots: readonly string[]) {
  return filesUnder(root).flatMap((file) =>
    importSpecifiers(file).flatMap((specifier) => {
      const resolved = resolveSourceFile(resolveImport(file, specifier) ?? "");
      if (!resolved) return [];
      const relative = resolved.slice(`${sourceRoot}/`.length);
      return forbiddenRoots.some(
        (forbidden) => relative === forbidden || relative.startsWith(`${forbidden}/`),
      )
        ? [`${file}: ${specifier} -> ${relative}`]
        : [];
    }),
  );
}

describe("architectural boundaries", () => {
  it("keeps modules independent from outer application and infrastructure layers", () => {
    const forbidden = [
      "infrastructure",
      "providers",
      "application",
      "processors",
      "workers",
      "api",
    ];
    const violations = importViolations(join(sourceRoot, "modules"), forbidden);
    expect(violations).toEqual([]);
  });

  it("keeps provider implementations free of application orchestration imports", () => {
    const forbidden = ["application", "processors", "workers", "api"];
    const violations = importViolations(join(sourceRoot, "providers"), forbidden);
    expect(violations).toEqual([]);
  });

  it("keeps application implementations behind inward-facing contracts", () => {
    const forbidden = ["infrastructure", "providers", "processors", "workers", "api"];
    expect(importViolations(join(sourceRoot, "application"), forbidden)).toEqual([]);
  });

  it("keeps the kernel independent from database drivers", () => {
    const kernelFiles = filesUnder(join(sourceRoot, "kernel"));
    expect(
      kernelFiles.flatMap((file) =>
        importSpecifiers(file).filter((specifier) => specifier === "pg"),
      ),
    ).toEqual([]);
  });

  it("keeps production source free of colocated tests", () => {
    const violations = filesUnder(sourceRoot).filter((file) => /\.test\.[jt]sx?$/.test(file));
    expect(violations).toEqual([]);
  });

  it("keeps Next.js route ownership at the app boundary", () => {
    const appFiles = filesUnder(join(sourceRoot, "app"));
    const violations = appFiles.flatMap((file) =>
      importSpecifiers(file).flatMap((specifier) => {
        const resolved = resolveSourceFile(resolveImport(file, specifier) ?? "");
        if (!resolved) return [];
        const relative = resolved.slice(`${sourceRoot}/`.length);
        return relative === "api/hono.ts" || relative.startsWith("api/routes/")
          ? [`${file}: ${specifier} -> ${relative}`]
          : [];
      }),
    );
    expect(violations).toEqual([
      expect.stringContaining("app/api/[[...route]]/route.ts: @/api/hono -> api/hono.ts"),
    ]);
  });

  it("keeps the API root as composition and gives each capability its own route module", () => {
    const hono = resolve(sourceRoot, "api/hono.ts");
    const honoSource = readFileSync(hono, "utf8");
    const routeModules = filesUnder(resolve(sourceRoot, "api/routes"));
    expect(readFileSync(hono, "utf8").split("\n").length).toBeLessThan(220);
    expect(
      routeModules.map((file) => file.replace(`${resolve(sourceRoot, "api/routes")}/`, "")),
    ).toEqual(
      expect.arrayContaining([
        "blog.ts",
        "hierarchy.ts",
        "funding.ts",
        "payment-callbacks.ts",
        "reviews.ts",
        "account-access.ts",
        "operator/operations.ts",
        "operator/accounts.ts",
        "operator/capabilities.ts",
        "operator/funding.ts",
        "operator/finance.ts",
        "operator/withdrawal.ts",
        "operator/treasury.ts",
        "api-keys.ts",
      ]),
    );
    expect(existsSync(resolve(sourceRoot, "api/routes/contracts.ts"))).toBe(false);
    expect(honoSource).not.toContain("x-required-api-scope");
    expect(honoSource).not.toContain("/api/operator/");
  });

  it("keeps legacy compatibility dispatch separate from its route registry", () => {
    const dispatcher = resolve(sourceRoot, "api/legacy-dispatch.ts");
    const registry = resolve(sourceRoot, "api/compat/dispatch/routes.ts");
    expect(readFileSync(dispatcher, "utf8").split("\n").length).toBeLessThan(240);
    expect(readFileSync(registry, "utf8")).toContain("export const legacyRoutes");
  });

  it("keeps the public API client entry point small and domain implementations separate", () => {
    const client = resolve(sourceRoot, "lib/api-client.ts");
    const domainFiles = filesUnder(resolve(sourceRoot, "lib/api"));
    expect(statSync(client).size).toBeLessThan(2_000);
    expect(domainFiles.map((file) => file.split("/").at(-1))).toEqual(
      expect.arrayContaining(["listing.ts", "wallet.ts", "commerce.ts", "money.ts"]),
    );
  });

  it("does not let malformed provider responses cross internal package boundaries", () => {
    const violations = packageRoots.flatMap((root) =>
      filesUnder(root).flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return [
          ...(source.match(/as\s+T\b/g) ?? []).map((match) => `${file}: ${match}`),
          ...(source.match(/Record<string,\s*any>/g) ?? []).map((match) => `${file}: ${match}`),
          ...(source.match(/z\.coerce/g) ?? []).map((match) => `${file}: ${match}`),
        ];
      }),
    );
    expect(violations).toEqual([]);
  });
});

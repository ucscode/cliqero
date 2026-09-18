import { fileURLToPath } from "node:url";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const ignoredVariables = new Set(["NODE_ENV", "TEST_DATABASE_URL"]);

function filesUnder(directory: string, predicate: (file: string) => boolean): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(file, predicate);
    return predicate(file) ? [file] : [];
  });
}

function namesMatching(contents: string, pattern: RegExp): Set<string> {
  return new Set(
    [...contents.matchAll(pattern)].flatMap((match) =>
      match.slice(1).filter((name): name is string => Boolean(name)),
    ),
  );
}

function contentsOf(files: string[]): string {
  return files.map((file) => readFileSync(file, "utf8")).join("\n");
}

it("keeps directly consumed runtime environment variables discoverable", () => {
  const runtimeFiles = [
    path.join(repositoryRoot, "apps/web/next.config.ts"),
    ...filesUnder(
      path.join(repositoryRoot, "apps/web/src"),
      (file) => /\.(?:js|mjs|cjs|ts|tsx)$/.test(file) && !/\.test\./.test(file),
    ),
    ...filesUnder(
      path.join(repositoryRoot, "scripts"),
      (file) => /\.(?:js|mjs|cjs|ts|tsx)$/.test(file) && !/\.test\./.test(file),
    ),
  ];
  const composeFiles = filesUnder(path.join(repositoryRoot, "services"), (file) =>
    /compose(?:\.override)?\.(?:yaml|yml)$/.test(file),
  );
  const rootComposeFiles = ["compose.yaml", "compose.override.yaml"]
    .map((file) => path.join(repositoryRoot, file))
    .filter(existsSync);
  const justfile = path.join(repositoryRoot, "justfile");
  const source = contentsOf(runtimeFiles);
  const composeInputs = contentsOf([...composeFiles, ...rootComposeFiles, justfile]);
  const directlyRead = namesMatching(
    source,
    /process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
  );
  const directNames = new Set([...directlyRead].flatMap((name) => (name ? [name] : [])));
  const composeNames = namesMatching(composeInputs, /\$\{([A-Z][A-Z0-9_]*)(?::-[^}]*)?\}/g);
  const documented = new Set([
    ...namesMatching(
      readFileSync(path.join(repositoryRoot, ".env.example"), "utf8"),
      /(?:^|\n)\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/g,
    ),
    ...namesMatching(
      readFileSync(path.join(repositoryRoot, "docs/operations/environment-variables.md"), "utf8"),
      /`([A-Z][A-Z0-9_]*)`/g,
    ),
  ]);
  const configurationOwned = namesMatching(
    contentsOf(
      filesUnder(path.join(repositoryRoot, "config"), (file) => /\.(?:yaml|yml)$/.test(file)),
    ),
    /%env\(([A-Z][A-Z0-9_]*)\)%/g,
  );
  const missing = [...new Set([...directNames, ...composeNames])]
    .filter((name) => !ignoredVariables.has(name))
    .filter((name) => !documented.has(name) && !configurationOwned.has(name))
    .sort();

  expect(missing).toEqual([]);
});

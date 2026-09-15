import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLocalConfigBundle,
  discoverExampleConfiguration,
  normalizeBundleName,
} from "../../../../scripts/create-local-config";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "cliqero-config-bundle-"));
  roots.push(root);
  await writeFile(join(root, ".env.example"), "EXAMPLE=true\n");
  await writeFile(join(root, ".env"), "REAL_SECRET=never-copy\n");
  await mkdir(join(root, "config", "security"), { recursive: true });
  await writeFile(join(root, "config", "site.example.yaml"), "name: Example\n");
  await writeFile(join(root, "config", "site.yaml"), "name: Secret site\n");
  await writeFile(join(root, "config", "security", "auth.example.yml"), "social: {}\n");
  return root;
}

describe("local configuration bundle generator", () => {
  it("discovers examples generically and preserves their runtime-relative paths", async () => {
    const root = await fixtureRoot();
    await mkdir(join(root, "config", "future"), { recursive: true });
    await writeFile(join(root, "config", "future", "nested.example.yaml"), "enabled: true\n");
    expect(await discoverExampleConfiguration(root)).toEqual([
      ".env.example",
      "config/future/nested.example.yaml",
      "config/security/auth.example.yml",
      "config/site.example.yaml",
    ]);
    const bundle = await createLocalConfigBundle({ root, name: "workstation" });
    expect(bundle.files).toEqual([
      ".env",
      "config/future/nested.yaml",
      "config/security/auth.yml",
      "config/site.yaml",
    ]);
    await expect(readFile(join(bundle.destination, ".env"), "utf8")).resolves.toBe(
      "EXAMPLE=true\n",
    );
    await expect(readFile(join(bundle.destination, "config", "site.yaml"), "utf8")).resolves.toBe(
      "name: Example\n",
    );
    await expect(
      readFile(join(bundle.destination, "config", "security", "auth.yml"), "utf8"),
    ).resolves.toBe("social: {}\n");
    await expect(readFile(join(root, ".env"), "utf8")).resolves.toBe("REAL_SECRET=never-copy\n");
    await expect(readFile(join(root, "config", "site.yaml"), "utf8")).resolves.toBe(
      "name: Secret site\n",
    );
    await expect(readFile(join(root, ".env.example"), "utf8")).resolves.toBe("EXAMPLE=true\n");
    await expect(readFile(join(root, "config", "site.example.yaml"), "utf8")).resolves.toBe(
      "name: Example\n",
    );
  });

  it("rejects unsafe names and preserves existing bundles unless force is explicit", async () => {
    const root = await fixtureRoot();
    await expect(createLocalConfigBundle({ root, name: "../outside" })).rejects.toThrow(
      "identifier",
    );
    await expect(createLocalConfigBundle({ root, name: "nested/name" })).rejects.toThrow(
      "identifier",
    );
    await expect(createLocalConfigBundle({ root, name: "" })).rejects.toThrow("identifier");
    expect(() => normalizeBundleName("staging")).not.toThrow();
    const initial = await createLocalConfigBundle({ root, name: "staging" });
    await writeFile(join(initial.destination, ".env"), "MANUAL=true\n");
    await expect(createLocalConfigBundle({ root, name: "staging" })).rejects.toThrow(
      "already exists",
    );
    await createLocalConfigBundle({ root, name: "staging", force: true });
    await expect(readFile(join(initial.destination, ".env"), "utf8")).resolves.toBe(
      "EXAMPLE=true\n",
    );
  });
});

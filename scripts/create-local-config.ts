import { copyFile, lstat, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const yamlExamplePattern = /\.example\.ya?ml$/;

export function normalizeBundleName(name: string | undefined) {
  const normalized = name?.trim();
  if (!normalized || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized)) {
    throw new Error(
      "Configuration bundle name must be a non-empty identifier without path separators.",
    );
  }
  return normalized;
}

export function transformExamplePath(path: string) {
  const normalized = path.split(sep).join("/");
  if (normalized === ".env.example") return ".env";
  return normalized.replace(/\.example(\.ya?ml)$/, "$1");
}

async function pathExists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
}

async function findYamlExamples(directory: string, root: string, found: string[]) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) await findYamlExamples(fullPath, root, found);
    else if (entry.isFile() && yamlExamplePattern.test(entry.name))
      found.push(relative(root, fullPath));
  }
}

export async function discoverExampleConfiguration(root = repositoryRoot) {
  const examples: string[] = [];
  if (await pathExists(join(root, ".env.example"))) examples.push(".env.example");
  const configDirectory = join(root, "config");
  if (await pathExists(configDirectory)) await findYamlExamples(configDirectory, root, examples);
  return examples.sort();
}

export async function createLocalConfigBundle({
  root = repositoryRoot,
  name,
  force = false,
}: {
  root?: string;
  name: string | undefined;
  force?: boolean;
}) {
  const bundleName = normalizeBundleName(name);
  const destination = join(root, `local.${bundleName}`);
  if (await pathExists(destination)) {
    if (!force) throw new Error(`Configuration bundle already exists: local.${bundleName}`);
    await rm(destination, { recursive: true, force: true });
  }
  const examples = await discoverExampleConfiguration(root);
  const files = examples.map(transformExamplePath);
  await mkdir(destination, { recursive: true });
  await Promise.all(
    examples.map(async (source, index) => {
      const target = join(destination, files[index]);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(root, source), target);
    }),
  );
  return { destination, files };
}

export async function main(args = process.argv.slice(2)) {
  const force = args.includes("--force");
  const names = args.filter((argument) => argument !== "--force");
  if (names.length !== 1) {
    throw new Error("Usage: npm run config:local -- <name> [--force]");
  }
  const { destination, files } = await createLocalConfigBundle({ name: names[0], force });
  console.log(`Created ${relative(repositoryRoot, destination)}`);
  for (const file of files) console.log(`  ${file}`);
  console.log(`${files.length} configuration files copied.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Could not create configuration bundle.",
    );
    process.exitCode = 1;
  });
}

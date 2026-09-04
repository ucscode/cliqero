import { parse } from "yaml";

type RuntimeModules = {
  fs: { existsSync(path: string): boolean; readFileSync(path: string, encoding: "utf8"): string };
  path: { dirname(path: string): string; resolve(...paths: string[]): string };
};

function runtimeModules(): RuntimeModules | null {
  const getBuiltinModule = (
    globalThis as typeof globalThis & {
      process?: { getBuiltinModule?: (name: string) => unknown };
    }
  ).process?.getBuiltinModule;
  if (!getBuiltinModule) return null;
  return {
    fs: getBuiltinModule("node:fs") as RuntimeModules["fs"],
    path: getBuiltinModule("node:path") as RuntimeModules["path"],
  };
}

export function parseYamlConfiguration(path: string): unknown {
  const resolved = resolveConfigurationPath(path);
  if (!resolved) return null;
  return parse(runtimeModules()!.fs.readFileSync(resolved, "utf8"));
}

function resolveConfigurationPath(path: string): string | null {
  const modules = runtimeModules();
  if (!modules) return null;
  if (!path.startsWith(".") && !path.startsWith("/")) {
    let directory = process.cwd();
    for (let i = 0; i < 6; i++) {
      const candidate = modules.path.resolve(directory, path);
      if (modules.fs.existsSync(candidate)) return candidate;
      const parent = modules.path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    return null;
  }
  return modules.fs.existsSync(path) ? modules.path.resolve(path) : null;
}

export function resolveEnvironmentPlaceholders(
  value: unknown,
  environment: Record<string, string | undefined> = process.env,
  sourcePath = "configuration",
): unknown {
  if (typeof value === "string")
    return value.replace(
      /%%env\(([A-Za-z_][A-Za-z0-9_]*)\)%%|%env\(([A-Za-z_][A-Za-z0-9_]*)\)%/g,
      (_match, escaped: string | undefined, name: string | undefined) => {
        if (escaped) return `%env(${escaped})%`;
        if (name === undefined) return _match;
        const resolved = environment[name];
        if (resolved === undefined)
          throw new Error(`Missing environment variable "${name}" while resolving ${sourcePath}`);
        return resolved;
      },
    );
  if (Array.isArray(value))
    return value.map((item) => resolveEnvironmentPlaceholders(item, environment, sourcePath));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveEnvironmentPlaceholders(item, environment, `${sourcePath}.${key}`),
      ]),
    );
  return value;
}

export function loadYamlConfiguration(
  path: string,
  environment: Record<string, string | undefined> = process.env,
  options: { required?: boolean } = {},
): unknown {
  const parsed = parseYamlConfiguration(path);
  if (parsed === null && options.required)
    throw new Error(`Required configuration file is missing: ${path}`);
  return parsed === null ? null : resolveEnvironmentPlaceholders(parsed, environment, path);
}

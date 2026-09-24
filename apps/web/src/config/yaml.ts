import { parse } from "yaml";

export class MissingEnvironmentVariableError extends Error {
  constructor(
    readonly variable: string,
    readonly sourcePath: string,
  ) {
    super(`Missing environment variable "${variable}" while resolving ${sourcePath}`);
    this.name = "MissingEnvironmentVariableError";
  }
}

export class YamlConfigurationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "YamlConfigurationError";
  }
}

type RuntimeModules = {
  fs: {
    existsSync(path: string): boolean;
    realpathSync(path: string): string;
    readFileSync(path: string, encoding: "utf8"): string;
  };
  path: {
    dirname(path: string): string;
    resolve(...paths: string[]): string;
  };
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
  const modules = runtimeModules();
  if (!modules) return null;
  return readComposedConfiguration(resolved, modules, []);
}

type ConfigurationParameters = Record<string, unknown>;

function isMapping(value: unknown): value is ConfigurationParameters {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mergeConfiguration(
  earlier: ConfigurationParameters,
  later: ConfigurationParameters,
): ConfigurationParameters {
  return Object.fromEntries(
    Object.entries(earlier)
      .map(([key, value]) => [key, value])
      .concat(
        Object.entries(later).map(([key, value]) => [
          key,
          Object.hasOwn(earlier, key) && isMapping(earlier[key]) && isMapping(value)
            ? mergeConfiguration(earlier[key], value)
            : Object.hasOwn(earlier, key) && Array.isArray(earlier[key]) && Array.isArray(value)
              ? [...earlier[key], ...value]
              : value,
        ]),
      ),
  );
}

function invalidEnvelope(path: string, reason: string): never {
  throw new YamlConfigurationError(`Invalid YAML configuration envelope in "${path}": ${reason}`);
}

function readConfigurationEnvelope(path: string, source: string) {
  let document: unknown;
  try {
    document = parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid YAML syntax";
    throw new YamlConfigurationError(`Invalid YAML configuration in "${path}": ${message}`, {
      cause: error,
    });
  }

  if (!isMapping(document)) invalidEnvelope(path, "the document root must be a mapping");
  const unknownKeys = Object.keys(document).filter(
    (key) => key !== "imports" && key !== "parameters",
  );
  if (unknownKeys.length) invalidEnvelope(path, `unknown root key(s): ${unknownKeys.join(", ")}`);
  if (!Object.hasOwn(document, "imports") || !Object.hasOwn(document, "parameters"))
    invalidEnvelope(path, 'both "imports" and "parameters" keys are required');

  const importsValue = document.imports;
  let imports: string[];
  if (importsValue === null) imports = [];
  else if (Array.isArray(importsValue)) {
    imports = importsValue.map((item) => {
      if (typeof item !== "string" || !item.trim())
        invalidEnvelope(path, '"imports" must contain only non-empty path strings');
      const importPath = item.trim();
      if (
        /^[a-z][a-z\d+.-]*:/i.test(importPath) ||
        importPath.startsWith("/") ||
        importPath.startsWith("\\") ||
        /^[a-z]:[\\/]/i.test(importPath) ||
        /[*?\[\]]/.test(importPath)
      )
        invalidEnvelope(path, `unsupported import path "${importPath}"`);
      if (!/\.ya?ml$/i.test(importPath))
        invalidEnvelope(path, `imports must reference explicit YAML files: "${importPath}"`);
      return importPath;
    });
  } else invalidEnvelope(path, '"imports" must be null or an array of non-empty path strings');

  const parametersValue = document.parameters;
  if (parametersValue !== null && !isMapping(parametersValue))
    invalidEnvelope(path, '"parameters" must be null or a mapping');

  return {
    imports,
    parameters: parametersValue ?? {},
  };
}

function readComposedConfiguration(
  filePath: string,
  modules: RuntimeModules,
  importChain: string[],
): ConfigurationParameters {
  const canonicalPath = modules.fs.realpathSync(filePath);
  const cycleStart = importChain.indexOf(canonicalPath);
  if (cycleStart >= 0) {
    const cycle = [...importChain.slice(cycleStart), canonicalPath];
    throw new YamlConfigurationError(`Circular YAML configuration import: ${cycle.join(" -> ")}`);
  }

  const { imports, parameters } = readConfigurationEnvelope(
    canonicalPath,
    modules.fs.readFileSync(canonicalPath, "utf8"),
  );
  const chain = [...importChain, canonicalPath];
  let merged: ConfigurationParameters = {};
  for (const importPath of imports) {
    const childPath = modules.path.resolve(modules.path.dirname(canonicalPath), importPath);
    if (!modules.fs.existsSync(childPath))
      throw new YamlConfigurationError(
        `Missing imported YAML configuration "${childPath}" imported by "${canonicalPath}"`,
      );
    merged = mergeConfiguration(merged, readComposedConfiguration(childPath, modules, chain));
  }
  return mergeConfiguration(merged, parameters);
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
        if (resolved === undefined) throw new MissingEnvironmentVariableError(name, sourcePath);
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

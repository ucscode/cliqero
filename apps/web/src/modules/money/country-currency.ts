import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export interface CurrencyMappingConfig {
  enabled?: boolean;
  overrides?: Readonly<Record<string, string>>;
}

const countryCodePattern = /^[A-Z]{2}$/;
const currencyCodePattern = /^[A-Z]{3}$/;

export class CountryCurrencyResolver {
  private readonly mapping: Readonly<Record<string, string>>;

  constructor(mapping: Readonly<Record<string, string>>) {
    this.mapping = validateMapping(mapping);
  }

  resolve(
    country: string | null | undefined,
    options?: { provider?: CurrencyMappingConfig; account?: CurrencyMappingConfig },
  ): string {
    const normalizedCountry = normalizeCountry(country);
    if (!normalizedCountry) return "USD";
    const provider = validateCurrencyMappingConfig(options?.provider);
    const account = validateCurrencyMappingConfig(options?.account);
    const enabled = account?.enabled ?? provider?.enabled ?? false;
    if (!enabled) return "USD";
    const override =
      account?.overrides?.[normalizedCountry] ?? provider?.overrides?.[normalizedCountry];
    if (override) return override;
    return this.mapping[normalizedCountry] ?? "USD";
  }
}

export function loadCountryCurrencyResolver(
  path = "apps/web/data/reference/country-currencies.json",
): CountryCurrencyResolver {
  const filePath = resolveReferencePath(path);
  const value = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new Error(`${path} must contain an object mapping country codes to currency codes`);
  return new CountryCurrencyResolver(value as Record<string, string>);
}

function resolveReferencePath(path: string): string {
  if (isAbsolute(path)) {
    if (existsSync(path)) return path;
    throw new Error(`Required reference data file is missing: ${path}`);
  }

  let directory = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(directory, path);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`Required reference data file is missing: ${path}`);
}

function validateMapping(mapping: Readonly<Record<string, string>>) {
  const normalized: Record<string, string> = {};
  for (const [country, currency] of Object.entries(mapping)) {
    if (!countryCodePattern.test(country))
      throw new Error(`Invalid country currency key: ${country}`);
    if (!currencyCodePattern.test(currency))
      throw new Error(`Invalid currency for country ${country}: ${currency}`);
    normalized[country] = currency;
  }
  return normalized;
}

export function validateCurrencyMappingConfig(
  config: CurrencyMappingConfig | undefined,
): CurrencyMappingConfig | undefined {
  if (!config) return undefined;
  const overrides = config.overrides ? validateMapping(config.overrides) : undefined;
  return { enabled: config.enabled ?? false, overrides };
}

function normalizeCountry(country: string | null | undefined) {
  if (country === null || country === undefined) return null;
  const normalized = country.trim().toUpperCase();
  return countryCodePattern.test(normalized) ? normalized : null;
}

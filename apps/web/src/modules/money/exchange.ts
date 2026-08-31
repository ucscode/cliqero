import { DomainInvariantError } from "@/kernel/errors";
import { Money } from "./money";

/** Immutable market quote; the decimal rate is kept as text to avoid binary floating point. */
export interface ExchangeRateQuote {
  readonly fromCurrency: string;
  readonly toCurrency: string;
  readonly rate: string;
  readonly source: string;
  readonly observedAt: Date;
  readonly sourceDate?: string;
  readonly fetchedAt?: Date;
}

export interface ExchangeRateProvider {
  getRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRateQuote>;
}

export interface CurrencyConverter {
  convert(amount: Money, quote: ExchangeRateQuote): Money;
}

/** Exact decimal conversion using integer arithmetic and deterministic half-up rounding. */
export class ExactCurrencyConverter implements CurrencyConverter {
  constructor(private readonly units: { from: number; to: number } = { from: 2, to: 2 }) {
    if (
      !Number.isInteger(units.from) ||
      !Number.isInteger(units.to) ||
      units.from < 0 ||
      units.to < 0
    )
      throw new DomainInvariantError("Currency minor-unit scales must be non-negative integers");
  }
  convert(amount: Money, quote: ExchangeRateQuote): Money {
    if (amount.currency !== quote.fromCurrency.toUpperCase())
      throw new DomainInvariantError("Exchange quote source currency does not match amount");
    const parsed = parseDecimal(quote.rate);
    const numerator = amount.minorAmount * parsed.numerator * 10n ** BigInt(this.units.to);
    const denominator = parsed.denominator * 10n ** BigInt(this.units.from);
    const rounded = (numerator + denominator / 2n) / denominator;
    return Money.of(rounded, quote.toCurrency);
  }
}

function parseDecimal(value: string): { numerator: bigint; denominator: bigint } {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized) || normalized === "0")
    throw new DomainInvariantError("Exchange rate must be a positive decimal string");
  const [whole, fraction = ""] = normalized.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  return { numerator: BigInt(whole) * denominator + BigInt(fraction || "0"), denominator };
}

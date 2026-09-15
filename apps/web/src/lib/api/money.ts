export function formatMinorUsd(minor: string | bigint): string {
  return formatMinorCurrency(minor, "USD");
}

/** Formats minor units as an ungrouped decimal value for copying or form input. */
export function formatMinorAmount(minor: string | bigint): string {
  const value = typeof minor === "bigint" ? minor : BigInt(minor);
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}${whole}.${cents}`;
}

export function formatMinorCurrency(minor: string | bigint, currency: string): string {
  const value = typeof minor === "bigint" ? minor : BigInt(minor);
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const dollars = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, "0");
  const normalized = currency.trim().toUpperCase();
  return normalized === "USD"
    ? `${sign}$${dollars.toLocaleString("en-US")}.${cents}`
    : `${sign}${normalized} ${dollars.toLocaleString("en-US")}.${cents}`;
}

/** Customer-facing exchange-rate display; conversion keeps the full rate string internally. */
export function formatExchangeRate(rate: string, currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized) || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rate))
    throw new Error("Exchange rate is invalid");
  const [wholePart, fraction = ""] = rate.split(".");
  const roundedFraction = fraction.padEnd(3, "0");
  let whole = BigInt(wholePart);
  let cents = BigInt(roundedFraction.slice(0, 2));
  if (Number(roundedFraction[2]) >= 5) {
    cents += 1n;
    if (cents === 100n) {
      whole += 1n;
      cents = 0n;
    }
  }
  return `${normalized} ${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
}

export function parseUsdMinor(value: string): string {
  const normalized = value.trim().replace(/^\$/, "");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized))
    throw new Error("Enter a USD amount with no more than two decimal places.");
  const [dollars, cents = ""] = normalized.split(".");
  const minor = BigInt(dollars) * 100n + BigInt(cents.padEnd(2, "0") || "0");
  if (minor <= 0n) throw new Error("Enter an amount greater than zero.");
  return minor.toString();
}

export function minorToUsdInput(minor: string | bigint): string {
  const value = typeof minor === "bigint" ? minor : BigInt(minor);
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

import { DomainInvariantError } from "@/kernel/errors";

export class Money {
  private constructor(
    readonly minorAmount: bigint,
    readonly currency: string,
  ) {}

  static of(minorAmount: bigint, currency: string): Money {
    const normalized = currency.trim().toUpperCase();
    if (minorAmount < 0n) throw new DomainInvariantError("Money cannot be negative");
    if (!/^[A-Z]{3}$/.test(normalized))
      throw new DomainInvariantError("Currency must be an ISO-style three-letter code");
    return new Money(minorAmount, normalized);
  }

  equals(other: Money): boolean {
    return this.minorAmount === other.minorAmount && this.currency === other.currency;
  }

  snapshot() {
    return { minorAmount: this.minorAmount.toString(), currency: this.currency } as const;
  }
}

/** Formats an ISO-currency minor-unit amount without converting through Number. */
export function formatMinorMoney(money: Money): string {
  const whole = money.minorAmount / 100n;
  const cents = (money.minorAmount % 100n).toString().padStart(2, "0");
  return money.currency === "USD"
    ? `$${whole.toLocaleString("en-US")}.${cents}`
    : `${money.currency} ${whole.toLocaleString("en-US")}.${cents}`;
}

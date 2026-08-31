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

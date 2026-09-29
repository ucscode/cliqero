import { Money } from "../money";

export function isFreeListingPrice(minorAmount: string | bigint) {
  return BigInt(minorAmount) === 0n;
}

export function ListingPrice({
  minorAmount,
  currency,
}: {
  minorAmount: string | bigint;
  currency: string;
}) {
  if (isFreeListingPrice(minorAmount))
    return <span className="font-semibold tracking-tight">Free</span>;
  return <Money minor={minorAmount} currency={currency} />;
}

import { Money } from "../money";

export function isFreeListingPrice(minorAmount: string | bigint) {
  return BigInt(minorAmount) === 0n;
}

export function ListingPrice({
  minorAmount,
  currency,
  compareAtMinorAmount,
}: {
  minorAmount: string | bigint;
  currency: string;
  compareAtMinorAmount?: string | bigint | null;
}) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {compareAtMinorAmount != null && (
        <del className="text-sm font-normal text-slate-500">
          <Money minor={compareAtMinorAmount} currency={currency} />
        </del>
      )}
      {isFreeListingPrice(minorAmount) ? (
        <span className="font-semibold tracking-tight">Free</span>
      ) : (
        <Money minor={minorAmount} currency={currency} />
      )}
    </span>
  );
}

export function safeContinuation(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return fallback;
  return value;
}

/** Builds the internal funding route while retaining the listing checkout context. */
export function walletFundingUrl(listingId: string): string {
  return walletFundingUrlForCheckout(listingId);
}

export function canonicalWalletFundingUrl(returnTo?: string | null): string {
  const continuation = safeContinuation(returnTo, "/dashboard");
  return `/dashboard/wallet/fund?return=${encodeURIComponent(continuation)}`;
}

export function walletFundingStatusUrl(fundingId: string, returnTo?: string | null): string {
  const query = new URLSearchParams({ funding: fundingId });
  if (returnTo) query.set("return", safeContinuation(returnTo, "/dashboard"));
  return `/dashboard/wallet/fund?${query.toString()}`;
}

export function providerFundingPreparationUrl(
  provider: string,
  amount: string,
  returnTo?: string | null,
): string {
  const continuation = returnTo
    ? `&return=${encodeURIComponent(safeContinuation(returnTo, "/dashboard"))}`
    : "";
  return `/dashboard/wallet/fund/${encodeURIComponent(provider)}?amount=${encodeURIComponent(amount)}${continuation}`;
}

export function walletFundingUrlForCheckout(listingId: string, checkoutId?: string): string {
  const checkout = checkoutId ? `&checkout=${encodeURIComponent(checkoutId)}` : "";
  const returnTo = safeContinuation(
    `/dashboard?buy=${encodeURIComponent(listingId)}${checkout}`,
    "/dashboard",
  );
  return canonicalWalletFundingUrl(returnTo);
}

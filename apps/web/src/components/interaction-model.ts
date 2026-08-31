export function canShowPromote(authenticated: boolean): boolean {
  return authenticated;
}

export function buyContinuation(listingId: string): string {
  return `/listings/${encodeURIComponent(listingId)}?buy=1`;
}

export function postAuthBuyPath(listingId: string): string {
  return `/dashboard?buy=${encodeURIComponent(listingId)}`;
}

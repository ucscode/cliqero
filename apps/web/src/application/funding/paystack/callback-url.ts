import { siteConfig } from "@/config/site";

export function fundingStatusUrl(fundingId: string) {
  const url = new URL("/dashboard/wallet/fund", siteConfig.url);
  url.searchParams.set("funding", fundingId);
  return url;
}

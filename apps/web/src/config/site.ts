export const siteConfig = {
  name: process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Cliqero",
  url: process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.APP_URL || "http://localhost:3000",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@cliqero.com",
  description:
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION?.trim() ||
    "Catalogue commerce, wallet access and referrals.",
} as const;

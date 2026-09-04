import type { NextConfig } from "next";
import { getEnabledSocialProviders } from "./src/config/auth";
import { loadYamlConfiguration } from "./src/config/yaml";

const site = loadYamlConfiguration("config/site.yaml", {
  ...process.env,
  APP_URL: process.env.APP_URL?.trim() || "http://localhost:3000",
}) as { name?: string; url?: string; support_email?: string; description?: string } | null;

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // TypeScript 5.9 exposes the compiler API used by Next's stable checker;
  // avoid the experimental CLI parser in Next 16.3 during production builds.
  experimental: { useTypeScriptCli: false },
  env: {
    NEXT_PUBLIC_SITE_CONFIG: JSON.stringify({
      name: site?.name || "Cliqero",
      url: site?.url || process.env.APP_URL || "http://localhost:3000",
      support_email: site?.support_email || "support@cliqero.com",
      description: site?.description || "Catalogue commerce, wallet access and referrals.",
    }),
    NEXT_PUBLIC_AUTH_CONFIG: JSON.stringify({
      google: { enabled: Boolean(getEnabledSocialProviders().google) },
    }),
  },
};

export default nextConfig;

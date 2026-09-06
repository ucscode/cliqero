import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getEnabledSocialProviders } from "./src/config/auth";
import { loadSiteConfiguration, toPublicSiteConfiguration } from "./src/config/site-loader";
import createMDX from "@next/mdx";

const repositoryRoot = existsSync(resolve(process.cwd(), "config/site.yaml"))
  ? process.cwd()
  : resolve(process.cwd(), "../..");
loadEnvConfig(repositoryRoot, false, undefined, true);

const site = loadSiteConfiguration();

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // TypeScript 5.9 exposes the compiler API used by Next's stable checker;
  // avoid the experimental CLI parser in Next 16.3 during production builds.
  // The JavaScript MDX pipeline is required so remark-frontmatter can remove
  // YAML metadata before rendering; mdxRs does not run custom remark plugins.
  experimental: { useTypeScriptCli: false },
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
  env: {
    NEXT_PUBLIC_SITE_CONFIG: JSON.stringify(toPublicSiteConfiguration(site)),
    NEXT_PUBLIC_AUTH_CONFIG: JSON.stringify({
      google: { enabled: Boolean(getEnabledSocialProviders().google) },
    }),
  },
};

export default createMDX({
  extension: /\.mdx?$/,
  options: { remarkPlugins: [resolve(__dirname, "remark-frontmatter.mjs")] },
})(nextConfig);

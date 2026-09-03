import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // TypeScript 5.9 exposes the compiler API used by Next's stable checker;
  // avoid the experimental CLI parser in Next 16.3 during production builds.
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;

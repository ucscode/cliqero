import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./styles.css";
import { siteConfig } from "@/config/site";
import { loadSiteConfiguration } from "@/config/site-loader";
import { CrudConfigurationProvider } from "@/components/crud/configuration";

const crudMaxRows = loadSiteConfiguration().crud.table.max_rows;

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
  alternates: { types: { "application/rss+xml": "/blog/rss.xml" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <CrudConfigurationProvider maxRows={crudMaxRows}>{children}</CrudConfigurationProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import localFont from "next/font/local";
import "./styles.css";
import { siteConfig } from "@/config/site";
import { loadSiteConfiguration } from "@/config/site-loader";
import { CrudConfigurationProvider } from "@/components/crud/configuration";
import { ToastProvider } from "@/components/toast/provider";

const crudMaxRows = loadSiteConfiguration().crud.table.max_rows;

const manrope = localFont({
  src: "../../data/fonts/manrope-latin-variable.woff2",
  weight: "200 800",
  style: "normal",
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
        <ToastProvider>
          <CrudConfigurationProvider maxRows={crudMaxRows}>{children}</CrudConfigurationProvider>
        </ToastProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Cliqero",
  description: "Productless commerce and referrals",
  alternates: { types: { "application/rss+xml": "/blog/rss.xml" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import Link from "next/link";
import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-slate-600 sm:px-8">
        <p>
          © {new Date().getFullYear()} {siteConfig.name}
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Footer navigation">
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/blog/rss.xml">RSS</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export function BrandIdentity({ className }: { className?: string }) {
  return (
    <span className={cn("brand", className)}>
      <span className="brand-mark">{siteConfig.name.slice(0, 1)}</span>
      <span>{siteConfig.name}</span>
    </span>
  );
}

type BrandLinkProps = Omit<React.ComponentProps<typeof Link>, "href">;

export function BrandLink({ className, ...props }: BrandLinkProps) {
  return (
    <Link
      {...props}
      href="/"
      className={cn("brand", className)}
      aria-label={props["aria-label"] ?? `${siteConfig.name} home`}
    >
      <BrandIdentity className="contents" />
    </Link>
  );
}

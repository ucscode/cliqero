import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { siteConfig } from "@/config/site";

export function AuthBrandHeader() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 font-semibold"
      aria-label={`${siteConfig.name} home`}
    >
      <span className="brand-mark">{siteConfig.name.slice(0, 1)}</span>
      <span>{siteConfig.name}</span>
    </Link>
  );
}

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-10 sm:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-3">
          <AuthBrandHeader />
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <CardTitle className="text-3xl leading-tight">{title}</CardTitle>
          {description && <p className="text-sm leading-relaxed text-slate-500">{description}</p>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}

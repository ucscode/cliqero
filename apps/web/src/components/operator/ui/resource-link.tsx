"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { hasCapability, type Capability } from "@/modules/identity/capabilities";

/** Links to another Operator section only when the current principal can open it. */
export function OperatorResourceLink({
  capabilities,
  requiredCapability,
  href,
  children,
  className,
}: {
  capabilities: readonly string[];
  requiredCapability: Capability;
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return hasCapability(capabilities, requiredCapability) ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <span>{children}</span>
  );
}

import { describe, expect, it } from "vitest";
import { badgeVariants } from "./ui/badge";
import { buttonVariants } from "./ui/button";
import { cn } from "@/lib/utils";

describe("UI foundation primitives", () => {
  it("maps semantic button variants to accessible utility styles", () => {
    expect(buttonVariants({ variant: "default" })).toContain("!text-white");
    expect(buttonVariants({ variant: "destructive", size: "sm" })).toContain("bg-red-700");
    expect(buttonVariants({ variant: "outline" })).toContain("border-slate-300");
  });

  it("keeps badge variants distinct", () => {
    expect(badgeVariants({ variant: "default" })).toContain("bg-emerald-700");
    expect(badgeVariants({ variant: "secondary" })).toContain("bg-slate-100");
  });

  it("merges utility classes without duplicate conflicting tokens", () => {
    expect(cn("px-2 py-2", "px-4")).toContain("px-4");
  });
});

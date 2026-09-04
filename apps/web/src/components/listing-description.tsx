import { cn } from "@/lib/utils";

export function listingDescription(description: string): string {
  return description.trim() || "A considered way to move forward.";
}

export function ListingDescription({
  description,
  className,
}: {
  description: string;
  className?: string;
}) {
  return <p className={cn(className)}>{listingDescription(description)}</p>;
}

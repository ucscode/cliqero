"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "./ui/button";

/** Promotion has no server-side link inventory: URLs are deterministic per listing/account. */
export function PromotePanel() {
  return (
    <section className="grid gap-4" aria-labelledby="promote-heading">
      <div>
        <p className="eyebrow">Promote</p>
        <h2 id="promote-heading">Share useful catalogue listings</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Open any eligible published listing and choose Promote to get your personal share URL. A
          qualifying purchase may create referral earnings; a visit alone never guarantees a
          commission.
        </p>
      </div>
      <Button asChild variant="secondary" className="w-fit">
        <Link href="/catalogue">
          Browse the catalogue <ArrowUpRight className="ml-1 h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public customer copy", () => {
  it("explains promotion without exposing attribution or settlement implementation", () => {
    const promotePage = read("src/app/promote/page.tsx");
    expect(promotePage).toContain("Some catalogue products can be shared using referral links.");
    expect(promotePage).toContain("qualifying purchase");
    expect(promotePage).toContain("Clicks alone do not earn commission.");
    expect(promotePage).toMatch(/You can use Cliqero\s+without promoting anything\./);
    expect(promotePage).not.toMatch(
      /deterministic attributed URLs|existing commission policy|earnings entry|settlement lifecycle/i,
    );
  });

  it("keeps support guidance free of customer-facing API-key instructions", () => {
    expect(read("src/app/contact/page.tsx")).toContain("Never send your password");
    expect(read("src/app/contact/page.tsx")).not.toContain("API key");
    expect(read("content/pages/faq.mdx")).not.toContain("API key");
  });

  it("describes actual catalogue search and sorting and uses referral-link language", () => {
    const howItWorks = read("content/pages/how-it-works.mdx");
    const faq = read("content/pages/faq.mdx");
    expect(howItWorks).toContain("Search or sort the catalogue");
    expect(howItWorks).not.toContain("Search and filters");
    expect(howItWorks).toContain("share its referral link");
    expect(faq).toContain("shared with a referral link");
    expect(faq).not.toContain("attributed referral link");
  });

  it("offers a primary homepage action to browse the catalogue", () => {
    const home = read("src/app/page.tsx");
    expect(home).toContain('<Link href="/catalogue">Browse catalogue</Link>');
    expect(home).toContain('<Button asChild className="mt-6">');
  });

  it("explains bank-transfer evidence without exposing internal operator roles", () => {
    const bankTransfer = read("src/components/payment/bank-transfer/payment.tsx");
    expect(bankTransfer).toContain("our review team");
    expect(bankTransfer).toContain("does not confirm payment or");
    expect(bankTransfer).not.toContain("operator reconcile");
    expect(bankTransfer).not.toContain("note for the operator");
  });
});

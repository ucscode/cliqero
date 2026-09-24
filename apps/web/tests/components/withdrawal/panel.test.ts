import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WITHDRAWAL_HISTORY_PREVIEW_SIZE } from "@/components/withdrawal/panel";

const source = readFileSync(resolve(process.cwd(), "src/components/withdrawal/panel.tsx"), "utf8");

describe("withdrawal request UI contract", () => {
  it("uses saved destinations and submits only their ID with amount and currency", () => {
    expect(source).toContain('"/api/withdrawal-destinations"');
    expect(source).toContain("destination_id: destination");
    expect(source).toContain("amount_minor: amountMinor");
    expect(source).toContain("currency,");
    expect(source).toContain("No payout method is available for withdrawals.");
    expect(source).toContain("/dashboard/payout-methods/new");
    expect(source).toContain("Add payout method");
    expect(source).toContain("Payout method</Label>");
    expect(source).toContain("Choose a payout method</option>");
    expect(source).not.toContain("Payout destination reference");
    expect(source).not.toContain("destination_reference");
    expect(source).not.toContain("destination_type");
  });

  it("uses general available-earnings wording and safe destination identity in history", () => {
    expect(source).toContain("available earnings");
    expect(source).toContain(
      "<WithdrawalHistoryList withdrawals={page?.withdrawals ?? []} onCancel={cancel} />",
    );
    expect(source).not.toContain("settled referral earnings");
    expect(source).not.toContain("Policy supplied by Cliqero");
    expect(source).not.toMatch(/<textarea\b/i);
  });

  it("requests only a small dashboard preview and links to the full history", () => {
    expect(WITHDRAWAL_HISTORY_PREVIEW_SIZE).toBe(5);
    expect(source).toContain("WITHDRAWAL_HISTORY_PREVIEW_SIZE");
    expect(source).toContain("/dashboard/withdrawals/history");
    expect(source).toContain("View full history");
    expect(source).not.toContain('<Badge variant="destructive">{page.withdrawals.length}</Badge>');
  });

  it("clears request fields only after successful creation and keeps field errors adjacent", () => {
    expect(source).toContain('setAmount("");');
    expect(source).toContain('setDestination("");');
    expect(source).toContain("setAmountError(message)");
    expect(source).toContain("setDestinationError(message)");
    expect(source).toContain('id="withdrawal-amount-error"');
    expect(source).toContain('id="withdrawal-destination-error"');
    expect(source).toContain("setRequestError(message)");
    const requestCall = source.indexOf('await apiFetch<Withdrawal>("/api/withdrawals"');
    const failureStart = source.indexOf("} catch (cause) {", requestCall);
    const failureEnd = source.indexOf("} finally {", failureStart);
    const failureHandler = source.slice(failureStart, failureEnd);
    expect(failureHandler).not.toContain("setAmount(");
    expect(failureHandler).not.toContain("setDestination(");
  });

  it("loads initially and refreshes only after explicit or successful user actions", () => {
    expect(source).toContain("void load();");
    expect(source).toContain("onClick={() => void load(true)}");

    const requestCall = source.indexOf('await apiFetch<Withdrawal>("/api/withdrawals"');
    const requestSuccess = source.indexOf("await load(true);", requestCall);
    expect(requestSuccess).toBeGreaterThan(requestCall);

    const cancelStart = source.indexOf("async function cancel(");
    const cancelEnd = source.indexOf("return (", cancelStart);
    const cancelHandler = source.slice(cancelStart, cancelEnd);
    expect(cancelHandler).toContain('method: "PATCH"');
    expect(cancelHandler).toContain("await load(true);");
  });

  it("does not automatically poll for requested or approved withdrawals", () => {
    expect(source).not.toContain("activeStates");
    expect(source).not.toContain("activeWithdrawals");
    expect(source).not.toContain("setTimeout");
    expect(source).not.toContain("visibilityState");
  });

  it("keeps a disabled policy idle without recurring requests", () => {
    expect(source).toContain("disabled={!policy?.enabled || submitting}");
    expect(source).toContain("Withdrawals are currently disabled.");
    expect(source).not.toContain("setTimeout");
  });
});

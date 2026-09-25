import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WITHDRAWAL_HISTORY_PREVIEW_SIZE } from "@/components/withdrawal/panel";
import { ActionLock } from "@/components/withdrawal/action-lock";

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
      "<WithdrawalHistoryList\n              withdrawals={page?.withdrawals ?? []}\n              onCancel={setWithdrawalToCancel}\n            />",
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

  it("confirms a withdrawal request without exposing internal reviewer roles", () => {
    expect(source).toContain("Withdrawal request received. We’ll update its status after review.");
    expect(source).not.toContain("Payment follows operator review");
  });

  it("loads initially and refreshes only after explicit or successful user actions", () => {
    expect(source).toContain("void load();");
    expect(source).toContain("onClick={() => void load(true)}");

    const requestCall = source.indexOf('await apiFetch<Withdrawal>("/api/withdrawals"');
    const requestSuccess = source.indexOf("await load(true);", requestCall);
    expect(requestSuccess).toBeGreaterThan(requestCall);

    const cancelStart = source.indexOf("async function confirmCancellation()");
    const cancelEnd = source.indexOf("return (", cancelStart);
    const cancelHandler = source.slice(cancelStart, cancelEnd);
    expect(cancelHandler).toContain('method: "PATCH"');
    expect(cancelHandler).toContain("await load(true);");
    expect(cancelHandler).toContain('JSON.stringify({ status: "cancelled" })');
  });

  it("opens a confirmation dialog instead of calling the cancellation API from the row action", () => {
    expect(source).not.toContain("window.confirm");
    expect(source).toContain("onCancel={setWithdrawalToCancel}");
    expect(source).toContain("Cancel withdrawal request?");
    expect(source).toContain("Keep request");
    expect(source).toContain('variant="destructive"');
    expect(source).toContain("onClick={() => setWithdrawalToCancel(null)}");
  });

  it("runs the confirmed cancellation only once while the action is pending", async () => {
    const lock = new ActionLock();
    let release!: () => void;
    const request = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const first = lock.run(request);
    expect(request).toHaveBeenCalledOnce();
    await expect(lock.run(request)).resolves.toBe(false);
    expect(request).toHaveBeenCalledOnce();
    release();
    await expect(first).resolves.toBe(true);
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

  it("uses the withdrawal resource's authoritative available amount", () => {
    expect(source).toContain('const availableMinor = page?.available_minor ?? "0";');
    expect(source).not.toContain('apiFetch<EarningsSummary>("/api/earnings")');
    expect(source).not.toContain('balance.state === "available"');
  });
});

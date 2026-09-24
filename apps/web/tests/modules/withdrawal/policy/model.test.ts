import { describe, expect, it } from "vitest";
import {
  parseWithdrawalAmount,
  withdrawalBadgeVariant,
  withdrawalRequestErrorField,
} from "@/components/withdrawal/model";

describe("withdrawal request presentation rules", () => {
  it("places amount-related failures beside the amount field and method failures beside selection", () => {
    expect(withdrawalRequestErrorField("Withdrawal amount is below the minimum")).toBe("amount");
    expect(withdrawalRequestErrorField("Insufficient available funds")).toBe("amount");
    expect(withdrawalRequestErrorField("Choose a payout method")).toBe("destination");
    expect(withdrawalRequestErrorField("The service is temporarily unavailable")).toBeNull();
  });

  it("parses the configured currency amount as integer minor units", () => {
    expect(parseWithdrawalAmount("12.30", "USD")).toBe("1230");
    expect(() => parseWithdrawalAmount("12.345", "USD")).toThrow("USD amount");
    expect(() => parseWithdrawalAmount("0", "USD")).toThrow("greater than zero");
  });

  it("uses non-destructive status variants for in-progress states", () => {
    expect(withdrawalBadgeVariant("requested")).toBe("warning");
    expect(withdrawalBadgeVariant("approved")).toBe("info");
    expect(withdrawalBadgeVariant("completed")).toBe("default");
    expect(withdrawalBadgeVariant("rejected")).toBe("destructive");
    expect(withdrawalBadgeVariant("failed")).toBe("destructive");
    expect(withdrawalBadgeVariant("cancelled")).toBe("secondary");
  });
});

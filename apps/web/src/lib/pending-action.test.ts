import { describe, expect, it, vi } from "vitest";
import { withPendingState } from "./pending-action";

describe("pending action state", () => {
  it("always returns to idle after an unexpected failure", async () => {
    const states: boolean[] = [];
    await expect(
      withPendingState(
        (pending) => states.push(pending),
        async () => {
          throw new Error("network unavailable");
        },
      ),
    ).rejects.toThrow("network unavailable");
    expect(states).toEqual([true, false]);
  });

  it("returns to idle after a handled pre-request return", async () => {
    const states: boolean[] = [];
    let firstAttempt = true;
    const action = vi.fn(async () => {
      if (firstAttempt) {
        firstAttempt = false;
        return;
      }
      return "retry";
    });
    await withPendingState((pending) => states.push(pending), action);
    await withPendingState((pending) => states.push(pending), action);
    expect(action).toHaveBeenCalledTimes(2);
    expect(states).toEqual([true, false, true, false]);
  });
});

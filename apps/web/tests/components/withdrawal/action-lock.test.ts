import { describe, expect, it, vi } from "vitest";
import { ActionLock } from "@/components/withdrawal/action-lock";

describe("confirmed customer withdrawal actions", () => {
  it("runs a confirmed operation once and rejects a second submission while pending", async () => {
    const lock = new ActionLock();
    let finish!: () => void;
    const apiAction = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(undefined);

    const first = lock.run(apiAction);
    await expect(lock.run(apiAction)).resolves.toBe(false);
    expect(apiAction).toHaveBeenCalledOnce();

    finish();
    await expect(first).resolves.toBe(true);
    await expect(lock.run(apiAction)).resolves.toBe(true);
    expect(apiAction).toHaveBeenCalledTimes(2);
  });
});

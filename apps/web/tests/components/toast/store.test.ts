import { describe, expect, it, vi } from "vitest";
import { ToastStore } from "@/components/toast/store";

describe("global toast store", () => {
  it("stacks notifications, notifies subscribers, and supports manual dismissal", () => {
    const store = new ToastStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const first = store.push("success", "Saved.");
    const second = store.push("info", "Updated.");

    expect(store.getSnapshot().map(({ message }) => message)).toEqual(["Saved.", "Updated."]);
    expect(listener).toHaveBeenCalledTimes(2);
    store.dismiss(first);
    expect(store.getSnapshot().map(({ id }) => id)).toEqual([second]);
    unsubscribe();
  });

  it.each([
    ["success", 4000],
    ["info", 5000],
    ["error", 6000],
  ] as const)("auto-dismisses %s notifications after %i ms", (kind, duration) => {
    vi.useFakeTimers();
    try {
      const store = new ToastStore();
      store.push(kind, "Notice");
      vi.advanceTimersByTime(duration);
      expect(store.getSnapshot()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

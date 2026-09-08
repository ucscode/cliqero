import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY_FEEDBACK_DURATION_MS, createCopyFeedbackReset } from "./referral-copy-feedback";

describe("referral copy feedback", () => {
  afterEach(() => vi.useRealTimers());

  it("resets copied feedback after a short delay and restarts that delay on repeated copies", () => {
    vi.useFakeTimers();
    const reset = vi.fn();
    const feedback = createCopyFeedbackReset(reset);

    feedback.schedule();
    vi.advanceTimersByTime(COPY_FEEDBACK_DURATION_MS - 1);
    expect(reset).not.toHaveBeenCalled();

    feedback.schedule();
    vi.advanceTimersByTime(COPY_FEEDBACK_DURATION_MS - 1);
    expect(reset).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("cancels pending feedback on unmount", () => {
    vi.useFakeTimers();
    const reset = vi.fn();
    const feedback = createCopyFeedbackReset(reset);

    feedback.schedule();
    feedback.dispose();
    vi.advanceTimersByTime(COPY_FEEDBACK_DURATION_MS);

    expect(reset).not.toHaveBeenCalled();
  });
});

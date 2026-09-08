export const COPY_FEEDBACK_DURATION_MS = 2_400;

type TimerApi = Pick<typeof globalThis, "clearTimeout" | "setTimeout">;

export function createCopyFeedbackReset(onReset: () => void, timers: TimerApi = globalThis) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    schedule() {
      if (timer) timers.clearTimeout(timer);
      timer = timers.setTimeout(() => {
        timer = undefined;
        onReset();
      }, COPY_FEEDBACK_DURATION_MS);
    },
    dispose() {
      if (timer) timers.clearTimeout(timer);
      timer = undefined;
    },
  };
}

import { describe, expect, it } from "vitest";
import { CursorHistory } from "@/components/crud/cursor-history";

describe("CRUD cursor history", () => {
  it("starts without a previous cursor and traverses forward/backward", () => {
    const first = CursorHistory.firstPage();
    expect(first.current).toBeNull();
    expect(first.hasPrevious).toBe(false);
    expect(first.previous).toBeNull();

    const second = first.afterNext("cursor-2");
    const third = second.afterNext("cursor-3");
    expect(second.current).toBe("cursor-2");
    expect(second.previous).toBeNull();
    expect(third.previous).toBe("cursor-2");

    const returned = third.afterPrevious();
    expect(returned.current).toBe("cursor-2");
    expect(returned.afterPrevious().current).toBeNull();
  });

  it("keeps navigation immutable so failed requests cannot corrupt history", () => {
    const first = CursorHistory.firstPage();
    const requestedNextCursor = "cursor-2";

    // The controller commits afterNext/afterPrevious only after a successful fetch.
    expect(first.current).toBeNull();
    expect(first.hasPrevious).toBe(false);
    expect(first.afterNext(requestedNextCursor).current).toBe(requestedNextCursor);
    expect(first.current).toBeNull();
  });
});

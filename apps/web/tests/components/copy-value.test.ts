import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ setCopied: vi.fn() }));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: vi.fn(),
    useState: vi.fn(() => [false, fixtures.setCopied]),
  };
});

import { CopyValue, copyValueActionLabel, copyValueButtonLabel } from "@/components/copy-value";

type CopyButton = ReactElement<{ onClick?: () => void }>;

function copyButtonFor(value: string, displayValue: string): CopyButton {
  const view = CopyValue({ label: "payment amount", value, displayValue });
  const children = view.props.children as ReactElement[];
  return children[1] as CopyButton;
}

afterEach(() => {
  vi.unstubAllGlobals();
  fixtures.setCopied.mockReset();
});

describe("copy value control", () => {
  it("uses one concise feedback label", () => {
    expect(copyValueButtonLabel(false)).toBe("Copy");
    expect(copyValueButtonLabel(true)).toBe("Copied");
  });

  it("keeps the action label suitable for an icon button", () => {
    expect(copyValueActionLabel("transfer amount", false)).toBe("Copy transfer amount");
    expect(copyValueActionLabel("transfer amount", true)).toBe("transfer amount copied");
  });

  it.each([
    ["25.00", "25.00 USDT"],
    ["0.00991099", "0.00991099 ETH"],
  ])("copies only the raw payment amount for %s", async (value, displayValue) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const button = copyButtonFor(value, displayValue);
    await button.props.onClick?.();

    expect(writeText).toHaveBeenCalledWith(value);
  });
});

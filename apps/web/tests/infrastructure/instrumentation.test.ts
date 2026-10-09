import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyProductionDatabaseRole } = vi.hoisted(() => ({
  verifyProductionDatabaseRole: vi.fn(),
}));

vi.mock("@/infrastructure/postgres/runtime-security", () => ({
  verifyProductionDatabaseRole,
}));

import { register } from "@/instrumentation";

describe("production instrumentation startup validation", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.clearAllMocks();
  });

  it("exits when the production authentication secret is missing", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    await register();

    expect(exit).toHaveBeenCalledWith(1);
    expect(verifyProductionDatabaseRole).not.toHaveBeenCalled();
  });

  it("verifies database privileges after validating a production secret", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "rehearsal-only-secret-0123456789abcdef");

    await register();

    expect(verifyProductionDatabaseRole).toHaveBeenCalledOnce();
  });
});

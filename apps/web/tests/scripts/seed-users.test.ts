import { describe, expect, it } from "vitest";
import {
  DEVELOPMENT_USER_FIXTURES,
  seedDevelopmentUsers,
  validateDevelopmentUserFixtures,
} from "@/infrastructure/postgres/seed/users";

describe("development referral user fixture", () => {
  it("defines one connected tree with unique users and emails", () => {
    const validation = validateDevelopmentUserFixtures();
    expect(DEVELOPMENT_USER_FIXTURES).toHaveLength(19);
    expect(validation.root.username).toBe("tree_root");
    expect(validation.central.username).toBe("central_user");
    expect(validation.depths.get("central_user")).toBe(3);
    expect(new Set(DEVELOPMENT_USER_FIXTURES.map((fixture) => fixture.username)).size).toBe(19);
    expect(new Set(DEVELOPMENT_USER_FIXTURES.map((fixture) => fixture.email)).size).toBe(19);
  });

  it("keeps the two central downline generations explicit", () => {
    const children = DEVELOPMENT_USER_FIXTURES.filter(
      (fixture) => fixture.parentUsername === "central_user",
    );
    const grandchildren = DEVELOPMENT_USER_FIXTURES.filter((fixture) =>
      children.some((child) => fixture.parentUsername === child.username),
    );
    expect(children.map((fixture) => fixture.username).sort()).toEqual([
      "central_leaf",
      "central_left",
      "central_right",
    ]);
    expect(
      DEVELOPMENT_USER_FIXTURES.filter((fixture) => fixture.parentUsername === "central_left")
        .map((fixture) => fixture.username)
        .sort(),
    ).toEqual(["central_left_1", "central_left_2", "central_left_3"]);
    expect(
      DEVELOPMENT_USER_FIXTURES.filter((fixture) => fixture.parentUsername === "central_right")
        .map((fixture) => fixture.username)
        .sort(),
    ).toEqual(["central_right_1", "central_right_2"]);
    expect(
      DEVELOPMENT_USER_FIXTURES.filter((fixture) => fixture.parentUsername === "central_leaf"),
    ).toHaveLength(0);
    expect(grandchildren.map((fixture) => fixture.username).sort()).toEqual([
      "central_left_1",
      "central_left_2",
      "central_left_3",
      "central_right_1",
      "central_right_2",
    ]);
  });

  it("rejects duplicate, disconnected, cyclic, and invalid root definitions", () => {
    const duplicate = [...DEVELOPMENT_USER_FIXTURES, DEVELOPMENT_USER_FIXTURES[1]];
    expect(() => validateDevelopmentUserFixtures(duplicate)).toThrow("Duplicate");
    expect(() =>
      validateDevelopmentUserFixtures(
        DEVELOPMENT_USER_FIXTURES.map((fixture) =>
          fixture.username === "alpha" ? { ...fixture, parentUsername: "missing" } : fixture,
        ),
      ),
    ).toThrow("parent not found");
    expect(() =>
      validateDevelopmentUserFixtures(
        DEVELOPMENT_USER_FIXTURES.map((fixture) =>
          fixture.username === "alpha" ? { ...fixture, parentUsername: "alpha_two" } : fixture,
        ),
      ),
    ).toThrow("cycle");
    expect(() =>
      validateDevelopmentUserFixtures(
        DEVELOPMENT_USER_FIXTURES.map((fixture) =>
          fixture.username === "tree_root" ? { ...fixture, parentUsername: "alpha" } : fixture,
        ),
      ),
    ).toThrow("one root");
  });

  it("blocks execution unless the explicit development context is active", async () => {
    const environment = process.env as Record<string, string | undefined>;
    const previous = environment.NODE_ENV;
    environment.NODE_ENV = "test";
    try {
      await expect(seedDevelopmentUsers()).rejects.toThrow("NODE_ENV=development");
    } finally {
      if (previous === undefined) Reflect.deleteProperty(environment, "NODE_ENV");
      else environment.NODE_ENV = previous;
    }
  });
});

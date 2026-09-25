import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  profile: {
    email: "member@example.test",
    username: "member",
    displayName: null as string | null,
    country: "NG" as string | null,
  },
  update: vi.fn(),
}));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => ({
    principalResolver: {
      resolve: async () => ({
        account: { id: "member-id", username: "member", country: state.profile.country },
      }),
    },
    profiles: {
      get: async () => state.profile,
      update: state.update,
    },
  }),
}));

import { PATCH } from "@/api/compat/me/profile/route";

describe("customer profile update boundary", () => {
  beforeEach(() => {
    state.profile = {
      email: "member@example.test",
      username: "member",
      displayName: null,
      country: "NG",
    };
    state.update
      .mockReset()
      .mockImplementation(async (_id: string, input: { country: string | null }) => {
        state.profile.country = input.country;
      });
  });

  async function patch(body: unknown) {
    return PATCH(
      new Request("http://localhost/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  it("rejects username mutation instead of silently ignoring it", async () => {
    const response = await patch({ username: "another_name" });

    expect(response.status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });

  it("rejects email mutation because canonical email belongs to authentication", async () => {
    const response = await patch({ email: "new@example.com" });

    expect(response.status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
    expect(state.profile.email).toBe("member@example.test");
  });

  it("accepts only country changes, including clearing the optional country", async () => {
    const changed = await patch({ country: "GH" });
    expect(changed.status).toBe(200);
    expect(state.update).toHaveBeenLastCalledWith("member-id", { country: "GH" });

    const cleared = await patch({ country: null });
    expect(cleared.status).toBe(200);
    expect(state.update).toHaveBeenLastCalledWith("member-id", { country: null });
  });
});

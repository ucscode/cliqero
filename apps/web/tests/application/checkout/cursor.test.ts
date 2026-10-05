import { describe, expect, it } from "vitest";
import { WalletCheckoutService } from "@/application/checkout/wallet";
import { CheckoutCursor } from "@/application/checkout/cursor";
import type { CheckoutRepository } from "@/modules/checkout/checkout";

describe("CheckoutCursor", () => {
  const cursor = new CheckoutCursor();
  const buyerId = "00000000-0000-4000-8000-000000000001";
  const boundary = {
    createdAt: "2026-04-10 11:22:33.123456+00",
    id: "00000000-0000-4000-8000-000000000002",
  };

  it("round-trips an opaque buyer-bound persisted boundary", () => {
    const encoded = cursor.encode(buyerId, boundary);
    expect(encoded).not.toContain(boundary.id);
    expect(cursor.decode(encoded, buyerId)).toEqual(boundary);
  });

  it("rejects malformed and cross-buyer cursors as a public 400", () => {
    expect(() => cursor.decode("not-a-cursor", buyerId)).toThrowError(
      expect.objectContaining({ status: 400, code: "invalid_cursor" }),
    );
    expect(() =>
      cursor.decode(cursor.encode(buyerId, boundary), "00000000-0000-4000-8000-000000000003"),
    ).toThrowError(expect.objectContaining({ status: 400, code: "invalid_cursor" }));
  });

  it("passes decoded boundaries to the buyer-scoped repository and encodes the next page", async () => {
    const nextBoundary = {
      createdAt: "2026-04-11 11:22:33.123456+00",
      id: "00000000-0000-4000-8000-000000000004",
    };
    const findForBuyer = async (
      requestedBuyer: string,
      input: { limit: number; before?: { createdAt: string; id: string } },
    ) => {
      expect(requestedBuyer).toBe(buyerId);
      expect(input.limit).toBe(1);
      expect(input.before).toEqual(boundary);
      return { items: [], nextBoundary };
    };
    const service = new WalletCheckoutService(
      {} as never,
      { findForBuyer } as unknown as CheckoutRepository,
      {} as never,
      {} as never,
      {} as never,
    );
    const inputCursor = cursor.encode(buyerId, boundary);
    const page = await service.listForBuyer(buyerId, { limit: 1, cursor: inputCursor });
    expect(page.items).toEqual([]);
    expect(cursor.decode(page.nextCursor ?? undefined, buyerId)).toEqual(nextBoundary);
  });
});

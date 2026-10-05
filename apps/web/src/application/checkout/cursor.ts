import { PublicApplicationError } from "@/kernel/errors";

export type CheckoutCursorBoundary = { createdAt: string; id: string };
type CheckoutCursorPayload = CheckoutCursorBoundary & { version: 1; buyerId: string };

export class CheckoutCursor {
  encode(buyerId: string, boundary: CheckoutCursorBoundary): string {
    return Buffer.from(JSON.stringify({ version: 1, buyerId, ...boundary })).toString("base64url");
  }

  decode(value: string | undefined, buyerId: string): CheckoutCursorBoundary | undefined {
    if (value === undefined) return undefined;
    try {
      const payload = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8"),
      ) as Partial<CheckoutCursorPayload> | null;
      if (
        !payload ||
        payload.version !== 1 ||
        payload.buyerId !== buyerId ||
        typeof payload.createdAt !== "string" ||
        !Number.isFinite(Date.parse(payload.createdAt)) ||
        typeof payload.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          payload.id,
        )
      )
        throw new Error("invalid cursor");
      return { createdAt: payload.createdAt, id: payload.id };
    } catch {
      throw new PublicApplicationError(
        "The checkout cursor is invalid or expired.",
        "invalid_cursor",
      );
    }
  }
}

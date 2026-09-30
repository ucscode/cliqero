import { PublicApplicationError } from "@/kernel/errors";

export type SortDirection = "asc" | "desc";

export type OperatorSortCursor = {
  sort: string;
  direction: SortDirection;
  value: string;
  id: string;
};

export function encodeOperatorSortCursor(cursor: OperatorSortCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeOperatorSortCursor(
  token: string | undefined,
  sort: string,
  direction: SortDirection,
): OperatorSortCursor | null {
  if (!token) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8"),
    ) as Partial<OperatorSortCursor>;
    if (
      decoded.sort !== sort ||
      decoded.direction !== direction ||
      typeof decoded.value !== "string" ||
      typeof decoded.id !== "string" ||
      !/^\d+$/.test(decoded.id) ||
      ((sort === "amount" || sort === "rating") && !/^-?\d+$/.test(decoded.value)) ||
      (["created", "submitted"].includes(sort) && Number.isNaN(Date.parse(decoded.value)))
    )
      throw new Error();
    return decoded as OperatorSortCursor;
  } catch {
    throw new PublicApplicationError("Invalid or stale pagination cursor", "invalid_cursor", 400);
  }
}

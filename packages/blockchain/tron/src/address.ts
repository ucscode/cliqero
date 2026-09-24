import bs58check from "bs58check";

/** Normalize supported TRON address encodings for protocol comparisons. */
export function normalizeTronAddress(value: string): string {
  const trimmed = value.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return `41${trimmed.slice(2).toLowerCase()}`;
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return `41${trimmed.slice(-40).toLowerCase()}`;
  if (/^41[0-9a-fA-F]{40}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return `41${trimmed.slice(-40).toLowerCase()}`;
  if (trimmed.startsWith("T")) {
    try {
      const decoded = bs58check.decode(trimmed);
      if (decoded.length === 21 && decoded[0] === 0x41) return Buffer.from(decoded).toString("hex");
    } catch {
      // Invalid Base58Check input retains the public trimmed-input behavior.
    }
  }
  return trimmed;
}

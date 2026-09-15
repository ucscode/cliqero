import { createHash } from "node:crypto";

/** Normalize supported TRON address encodings for protocol comparisons. */
export function normalizeTronAddress(value: string): string {
  const trimmed = value.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return `41${trimmed.slice(2).toLowerCase()}`;
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return `41${trimmed.slice(-40).toLowerCase()}`;
  if (/^41[0-9a-fA-F]{40}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return `41${trimmed.slice(-40).toLowerCase()}`;
  if (trimmed.startsWith("T")) {
    const decoded = decodeBase58(trimmed);
    if (decoded.length === 25 && decoded[0] === 0x41 && isValidBase58Check(decoded))
      return Buffer.from(decoded.subarray(0, 21)).toString("hex");
  }
  return trimmed;
}

function isValidBase58Check(value: Uint8Array) {
  const payload = value.subarray(0, -4);
  const checksum = value.subarray(-4);
  const digest = createHash("sha256")
    .update(createHash("sha256").update(payload).digest())
    .digest();
  return checksum.every((byte, index) => byte === digest[index]);
}

function decodeBase58(value: string): Uint8Array {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return new Uint8Array();
    number = number * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > 0n) {
    bytes.unshift(Number(number & 0xffn));
    number >>= 8n;
  }
  for (let index = 0; index < value.length && value[index] === "1"; index++) bytes.unshift(0);
  return Uint8Array.from(bytes);
}

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { ApplicationEncryption, type ApplicationEncryptionKey } from "@/kernel/encryption";

const root = Buffer.alloc(32, 7).toString("base64");
const previousRoot = Buffer.alloc(32, 8).toString("base64");

function encryption(
  currentVersion = 1,
  currentRootKey: string | undefined = root,
  previousKeys: readonly ApplicationEncryptionKey[] = [],
) {
  return new ApplicationEncryption({ currentVersion, currentRootKey, previousKeys });
}

describe("ApplicationEncryption", () => {
  it("encrypts and decrypts with authenticated, randomized payloads", () => {
    const service = encryption();
    const first = service.encrypt("api-key-recovery", "cliq_live_secret");
    const second = service.encrypt("api-key-recovery", "cliq_live_secret");

    expect(first.keyVersion).toBe(1);
    expect(service.decrypt("api-key-recovery", first)).toBe("cliq_live_secret");
    expect(first.nonce).not.toEqual(second.nonce);
    expect(first.ciphertext).not.toEqual(second.ciphertext);
  });

  it("derives separated keys for each supported purpose", () => {
    const service = encryption();
    const payload = service.encrypt("api-key-recovery", "secret");

    expect(() => service.decrypt("integration-secret", payload)).toThrow(
      "Encrypted application data could not be decrypted.",
    );
  });

  it("supports older read keys while writing with the current version", () => {
    const oldPayload = encryption(1, previousRoot).encrypt("api-key-recovery", "secret");
    const rotated = encryption(2, root, [{ version: 1, rootKey: previousRoot }]);

    expect(rotated.decrypt("api-key-recovery", oldPayload)).toBe("secret");
    expect(rotated.encrypt("api-key-recovery", "new").keyVersion).toBe(2);
  });

  it("rejects absent, malformed, and incorrectly sized root keys", () => {
    for (const key of [undefined, "not-base64", Buffer.alloc(16).toString("base64")]) {
      expect(() =>
        new ApplicationEncryption({ currentVersion: 1, currentRootKey: key }).encrypt(
          "api-key-recovery",
          "secret",
        ),
      ).toThrow(/APP_ENCRYPTION_KEY/);
    }
  });

  it("rejects tampered payloads and unsupported key versions", () => {
    const service = encryption();
    const payload = service.encrypt("api-key-recovery", "secret");
    const changed = { ...payload, ciphertext: Buffer.from(payload.ciphertext) };
    changed.ciphertext[0] ^= 1;
    expect(() => service.decrypt("api-key-recovery", changed)).toThrow(
      "Encrypted application data could not be decrypted.",
    );
    expect(() => service.decrypt("api-key-recovery", { ...payload, keyVersion: 99 })).toThrow(
      "unsupported key version",
    );
  });
});

import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { PublicApplicationError } from "@/kernel/errors";

export const APPLICATION_ENCRYPTION_PURPOSES = [
  "api-key-recovery",
  "integration-secret",
  "provider-credential",
] as const;

export type ApplicationEncryptionPurpose = (typeof APPLICATION_ENCRYPTION_PURPOSES)[number];

export type EncryptedPayload = {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: number;
};

export type ApplicationEncryptionKey = {
  version: number;
  rootKey: string;
};

export type ApplicationEncryptionConfiguration = {
  currentVersion: number;
  currentRootKey: string | undefined;
  previousKeys?: readonly ApplicationEncryptionKey[];
};

const keySalt = Buffer.from("cliqero:application-encryption:v1", "utf8");
const nonceLength = 12;
const authTagLength = 16;

export class ApplicationEncryption {
  constructor(
    private readonly configuration: ApplicationEncryptionConfiguration = {
      currentVersion: 1,
      currentRootKey: process.env.APP_ENCRYPTION_KEY,
    },
  ) {}

  encrypt(purpose: ApplicationEncryptionPurpose, plaintext: string): EncryptedPayload {
    const version = this.configuration.currentVersion;
    const key = this.deriveKey(purpose, version, this.configuration.currentRootKey);
    const nonce = randomBytes(nonceLength);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(this.additionalData(purpose, version));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return { ciphertext, nonce, authTag: cipher.getAuthTag(), keyVersion: version };
  }

  decrypt(purpose: ApplicationEncryptionPurpose, payload: EncryptedPayload): string {
    if (
      !Number.isInteger(payload.keyVersion) ||
      !Buffer.isBuffer(payload.ciphertext) ||
      !Buffer.isBuffer(payload.nonce) ||
      payload.nonce.length !== nonceLength ||
      !Buffer.isBuffer(payload.authTag) ||
      payload.authTag.length !== authTagLength
    )
      throw this.decryptionError();

    const rootKey = this.rootKeyForVersion(payload.keyVersion);
    const key = this.deriveKey(purpose, payload.keyVersion, rootKey);
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, payload.nonce);
      decipher.setAAD(this.additionalData(purpose, payload.keyVersion));
      decipher.setAuthTag(payload.authTag);
      return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]).toString(
        "utf8",
      );
    } catch {
      throw this.decryptionError();
    }
  }

  private rootKeyForVersion(version: number): string {
    if (version === this.configuration.currentVersion) {
      if (!this.configuration.currentRootKey?.trim())
        throw this.configurationError("APP_ENCRYPTION_KEY is not configured.");
      return this.configuration.currentRootKey;
    }
    const previous = this.configuration.previousKeys?.find((key) => key.version === version);
    if (previous) return previous.rootKey;
    throw new PublicApplicationError(
      "Encrypted application data uses an unsupported key version.",
      "unsupported_key_version",
      409,
    );
  }

  private deriveKey(
    purpose: ApplicationEncryptionPurpose,
    version: number,
    encodedRootKey: string | undefined,
  ): Buffer {
    if (!encodedRootKey?.trim())
      throw this.configurationError("APP_ENCRYPTION_KEY is not configured.");

    const rootKey = decodeRootKey(encodedRootKey);
    const context = Buffer.from(`cliqero:application-encryption:v${version}:${purpose}`, "utf8");
    return Buffer.from(hkdfSync("sha256", rootKey, keySalt, context, 32));
  }

  private additionalData(purpose: ApplicationEncryptionPurpose, version: number) {
    return Buffer.from(`cliqero:application-encryption:v${version}:${purpose}`, "utf8");
  }

  private configurationError(message: string) {
    return new PublicApplicationError(message, "configuration_error", 500);
  }

  private decryptionError() {
    return new PublicApplicationError(
      "Encrypted application data could not be decrypted.",
      "decryption_failed",
      409,
    );
  }
}

function decodeRootKey(encodedRootKey: string): Buffer {
  const normalized = encodedRootKey.trim();
  const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  if (!base64Pattern.test(normalized))
    throw new PublicApplicationError(
      "APP_ENCRYPTION_KEY is not configured correctly.",
      "configuration_error",
      500,
    );
  const key = Buffer.from(normalized, "base64");
  if (key.length !== 32 || key.toString("base64") !== normalized)
    throw new PublicApplicationError(
      "APP_ENCRYPTION_KEY is not configured correctly.",
      "configuration_error",
      500,
    );
  return key;
}

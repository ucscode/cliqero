export interface NowPaymentsIpnSignatureVerifier {
  verifyIpnSignature(rawBody: Uint8Array, signature: string | null): boolean;
}

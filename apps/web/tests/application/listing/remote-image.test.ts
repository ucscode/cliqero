import { describe, expect, it } from "vitest";
import { isForbiddenAddress } from "@/application/listing/remote-image";

describe("remote image IP address policy", () => {
  it("rejects every configured private, reserved, and non-public IPv4 range", () => {
    for (const address of [
      "0.1.2.3",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "192.0.0.1",
      "192.0.2.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
    ])
      expect(isForbiddenAddress(address), address).toBe(true);
  });

  it("rejects non-public IPv6 classes and IPv4-mapped addresses", () => {
    for (const address of [
      "::",
      "::1",
      "fc00::1",
      "fd12::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:8.8.8.8",
    ])
      expect(isForbiddenAddress(address), address).toBe(true);
  });

  it("allows known public IPv4 and IPv6 addresses and rejects invalid input", () => {
    expect(isForbiddenAddress("8.8.8.8")).toBe(false);
    expect(isForbiddenAddress("1.1.1.1")).toBe(false);
    expect(isForbiddenAddress("2001:4860:4860::8888")).toBe(false);
    expect(isForbiddenAddress("not-an-ip")).toBe(true);
  });
});

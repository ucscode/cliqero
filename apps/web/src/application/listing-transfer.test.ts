import { describe, expect, it } from "vitest";
import { parseTransfer, serializeTransfer, type ListingTransferRecord } from "./listing-transfer";
import { isForbiddenAddress } from "./remote-image";
const record: ListingTransferRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  external_key: "catalog-1",
  title: "=Safe title",
  description: "Description",
  price_minor: "1000",
  currency: "USD",
  destination: "https://destination.example/item",
  metadata: { category: "course", featured: true },
  state: "published",
  media: [
    {
      media_id: "00000000-0000-4000-8000-000000000003",
      transfer_identity: "media:three",
      url: "https://media.example/two.png",
      alt_text: "Second",
      position: 1,
    },
    {
      media_id: "00000000-0000-4000-8000-000000000002",
      transfer_identity: "media:two",
      url: "https://media.example/one.png",
      alt_text: "First",
      position: 0,
    },
  ],
};
describe("listing transfer formats", () => {
  for (const format of ["json", "csv", "yaml"] as const)
    it(`round-trips ${format} without losing structured semantics`, () => {
      const encoded = serializeTransfer([record], format);
      if (format === "csv") expect(encoded).toContain("'=Safe title");
      expect(parseTransfer(encoded, format)).toEqual([record]);
    });
  it("rejects unsafe YAML tags", () => {
    expect(() => parseTransfer("- !!js/function function () { return 1 }", "yaml")).toThrow();
  });
  it("rejects private, loopback, link-local, and documentation addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.1.1",
      "192.168.1.1",
      "::1",
      "fc00::1",
      "2001:db8::1",
    ])
      expect(isForbiddenAddress(address)).toBe(true);
    expect(isForbiddenAddress("8.8.8.8")).toBe(false);
  });
});

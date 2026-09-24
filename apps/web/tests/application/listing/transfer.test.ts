import { describe, expect, it } from "vitest";
import {
  parseTransfer,
  serializeTransfer,
  type ListingTransferRecord,
} from "@/application/listing/transfer";
const record: ListingTransferRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  external_key: "catalog-1",
  title: "=Safe title",
  short_description: "Quick summary",
  long_description: "Detailed description",
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
  it("round-trips CSV quotes, commas, newlines, CRLF, optional IDs, and JSON cells", () => {
    const complex: ListingTransferRecord = {
      ...record,
      id: undefined,
      retry_identity: undefined,
      external_key: undefined,
      title: '=Course, "Advanced"\r\nSecond line',
      metadata: { note: 'a, "quoted" value\nand another line' },
      media: [
        { url: "https://media.example/a.png", alt_text: 'comma, "quote"\nline', position: 0 },
      ],
    };
    const encoded = serializeTransfer([complex], "csv");
    expect(encoded).toContain('"\'=Course, ""Advanced""\r\nSecond line"');
    expect(parseTransfer(encoded, "csv")).toEqual([complex]);
    const oneLine = serializeTransfer([record], "csv").replaceAll("\n", "\r\n");
    expect(parseTransfer(oneLine, "csv")).toEqual([record]);
  });
  it("requires the exact CSV header and rejects malformed quotation", () => {
    expect(() => parseTransfer("title,price_minor\nA,1\n", "csv")).toThrow("CSV header is invalid");
    expect(() => parseTransfer('id,title\n"unterminated', "csv")).toThrow();
  });
  it.each(["=SUM(A1:A2)", "+SUM(A1:A2)", "-1+2", "@SUM(A1:A2)"])(
    "preserves formula protection for values beginning with %s",
    (title) => {
      const encoded = serializeTransfer([{ ...record, title }], "csv");
      expect(encoded).toContain(`'${title}`);
      expect((parseTransfer(encoded, "csv") as ListingTransferRecord[])[0].title).toBe(title);
    },
  );
});

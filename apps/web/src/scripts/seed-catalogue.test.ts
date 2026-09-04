import { describe, expect, it } from "vitest";
import { inspectImage } from "@/modules/listing-media/image";
import { fixturePng } from "./fixture-media";

describe("catalogue fixture media", () => {
  it("generates a valid image for the listing-media pipeline", () => {
    const result = inspectImage(fixturePng(35, 120, 95), "image/png");
    expect(result).toEqual({ mimeType: "image/png", width: 640, height: 360 });
  });
});

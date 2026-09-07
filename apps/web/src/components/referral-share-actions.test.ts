import { describe, expect, it } from "vitest";
import { referralShareDestinations } from "./referral-share-actions";

describe("referral share destinations", () => {
  it("keeps Copy separate and builds encoded links for deliberate destinations", () => {
    const url = "http://localhost:3000/r/referrer/listing?source=hello world";
    const destinations = referralShareDestinations(url);

    expect(destinations.map((destination) => destination.label)).toEqual([
      "WhatsApp",
      "Facebook",
      "X",
      "LinkedIn",
      "Telegram",
    ]);
    for (const destination of destinations) {
      expect(destination.href).toContain(encodeURIComponent(url));
      expect(destination.href).not.toContain("navigator.clipboard");
    }
  });
});

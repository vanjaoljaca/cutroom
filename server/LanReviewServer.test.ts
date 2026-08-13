import { describe, expect, it } from "vitest";
import { isPhoneReviewHost } from "./LanReviewServer";

describe("LAN review hostname routing", () => {
  it("routes only the friendly phone hostname to the review feed", () => {
    expect(isPhoneReviewHost("cutroom.local")).toBe(true);
    expect(isPhoneReviewHost("cutroom.local:80")).toBe(true);
    expect(isPhoneReviewHost("cutroom")).toBe(false);
    expect(isPhoneReviewHost("192.168.0.111")).toBe(false);
  });
});

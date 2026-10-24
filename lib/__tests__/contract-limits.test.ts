import { describe, expect, it } from "vitest";
import { MAX_LABEL_BYTES, MAX_PAGE, MAX_PERIOD, MIN_PERIOD } from "../limits";

describe("Stipend contract limits", () => {
  it("defines MIN_PERIOD as 1 hour (3600s)", () => {
    expect(MIN_PERIOD).toBe(3600n);
  });

  it("defines MAX_PERIOD as 365 days", () => {
    expect(MAX_PERIOD).toBe(365n * 86400n);
  });

  it("defines MAX_LABEL_BYTES as 60 bytes", () => {
    expect(MAX_LABEL_BYTES).toBe(60n);
  });

  it("defines MAX_PAGE as 50", () => {
    expect(MAX_PAGE).toBe(50n);
  });
});

import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { formatNativeAmount, parseNativeAmount } from "../amount";

describe("parseNativeAmount", () => {
  it("parses ordinary amounts", () => {
    expect(parseNativeAmount("1")).toBe(parseEther("1"));
    expect(parseNativeAmount("0.5")).toBe(parseEther("0.5"));
    expect(parseNativeAmount("  2.25  ")).toBe(parseEther("2.25"));
    expect(parseNativeAmount(".5")).toBe(parseEther("0.5"));
    expect(parseNativeAmount("1.")).toBe(parseEther("1"));
  });

  it("accepts exactly 18 decimal places", () => {
    expect(parseNativeAmount(`0.${"0".repeat(17)}1`)).toBe(1n);
  });

  it("rejects more precision than the chain has", () => {
    // parseEther truncates past 18 places without complaint, which would show the user one number
    // and send another.
    expect(parseNativeAmount(`0.${"0".repeat(18)}1`)).toBeNull();
  });

  it("rejects zero and everything that is not a plain decimal", () => {
    for (const bad of [
      "",
      " ",
      ".",
      "0",
      "0.0",
      "-1",
      "+1",
      "1e5",
      "1E5",
      "1,000",
      "abc",
      "1.2.3",
      "0x1",
      "Infinity",
      "NaN",
    ]) {
      expect(parseNativeAmount(bad), bad).toBeNull();
    }
  });
});

describe("formatNativeAmount", () => {
  it("trims without rounding up", () => {
    // Rounding up a balance would offer the user a MAX they cannot actually send.
    expect(formatNativeAmount(parseEther("1.999999"))).toBe("1.9999");
    expect(formatNativeAmount(parseEther("1.5"))).toBe("1.5");
    expect(formatNativeAmount(parseEther("2"))).toBe("2");
    expect(formatNativeAmount(0n)).toBe("0");
  });

  it("drops trailing zeros rather than padding", () => {
    expect(formatNativeAmount(parseEther("1.1000"))).toBe("1.1");
    expect(formatNativeAmount(parseEther("1.00001"))).toBe("1");
  });

  it("honours a custom precision", () => {
    expect(formatNativeAmount(parseEther("1.123456789"), 6)).toBe("1.123456");
  });
});

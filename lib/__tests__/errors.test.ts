import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { describeError, shortAddress } from "../errors";

describe("describeError mapping", () => {
  it("formats shortAddress correctly", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
    expect(shortAddress(undefined)).toBe("0x…");
  });

  it("handles OverAllowance error with arguments", () => {
    const err = {
      data: {
        errorName: "OverAllowance",
        args: [parseEther("0.05"), parseEther("0.1")],
      },
    };
    expect(describeError(err)).toBe("Only 0.05 BOT is left in this period's allowance.");
  });

  it("handles InsufficientBalance error with arguments", () => {
    const err = {
      data: {
        errorName: "InsufficientBalance",
        args: [parseEther("0.02"), parseEther("0.05")],
      },
    };
    expect(describeError(err)).toBe("The pot only holds 0.02 BOT right now.");
  });

  it("handles NotBeneficiary error with caller", () => {
    const caller = "0x9876543210abcdef1234567890abcdef12349999";
    const err = {
      data: {
        errorName: "NotBeneficiary",
        args: [1n, caller],
      },
    };
    expect(describeError(err)).toBe(`Only ${shortAddress(caller)} can draw from this allowance.`);
  });

  it("handles NotGuardian error", () => {
    const err = {
      data: {
        errorName: "NotGuardian",
        args: [1n],
      },
    };
    expect(describeError(err)).toBe("Only the guardian can close this.");
  });

  it("handles Closed error", () => {
    const err = {
      data: {
        errorName: "Closed",
        args: [1n],
      },
    };
    expect(describeError(err)).toBe("This allowance has been closed.");
  });

  it("handles BadPeriod error", () => {
    const err = {
      data: {
        errorName: "BadPeriod",
        args: [100n],
      },
    };
    expect(describeError(err)).toBe("Choose a period between an hour and a year.");
  });

  it("handles BadParty error", () => {
    const err = {
      data: {
        errorName: "BadParty",
        args: [],
      },
    };
    expect(describeError(err)).toBe("The recipient has to be someone other than you.");
  });

  it("handles ZeroAmount error", () => {
    const err = {
      data: {
        errorName: "ZeroAmount",
        args: [],
      },
    };
    expect(describeError(err)).toBe("Set an amount above zero.");
  });

  it("handles Reentrancy error", () => {
    const err = {
      data: {
        errorName: "Reentrancy",
        args: [],
      },
    };
    expect(describeError(err)).toBe("Reentrant call detected.");
  });

  it("handles user rejected error gracefully", () => {
    const err = new Error("User rejected the request.");
    expect(describeError(err)).toBe("Transaction was cancelled in wallet.");
  });
});

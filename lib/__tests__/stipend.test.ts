import { describe, expect, it } from "vitest";
import {
  allowanceLeft,
  describePeriod,
  gaugeFractions,
  nextRefill,
  periodIndex,
  spendable,
} from "../stipend";

describe("stipend maths and helper utilities", () => {
  const startAt = 1_760_000_000n;
  const period = 86400n; // 1 day
  const perPeriod = 200_000_000_000_000_000n; // 0.2 BOT

  it("calculates periodIndex accurately across boundaries", () => {
    // Before start
    expect(periodIndex(startAt, period, startAt - 100n)).toBe(0n);

    // Exact start
    expect(periodIndex(startAt, period, startAt)).toBe(0n);

    // Mid period 0
    expect(periodIndex(startAt, period, startAt + 43200n)).toBe(0n);

    // Exact end of period 0 (start + period - 1)
    expect(periodIndex(startAt, period, startAt + 86399n)).toBe(0n);

    // Exact boundary of period 1 (start + period)
    expect(periodIndex(startAt, period, startAt + 86400n)).toBe(1n);

    // Exact boundary of period 5
    expect(periodIndex(startAt, period, startAt + 5n * 86400n)).toBe(5n);
  });

  it("calculates nextRefill timestamp accurately", () => {
    // During period 0, next refill is startAt + period
    expect(nextRefill(startAt, period, startAt + 1000n)).toBe(startAt + period);

    // At exact boundary of period 1, next refill is startAt + 2 * period
    expect(nextRefill(startAt, period, startAt + period)).toBe(startAt + 2n * period);

    // At period 5, next refill is startAt + 6 * period
    expect(nextRefill(startAt, period, startAt + 5n * period + 10n)).toBe(startAt + 6n * period);
  });

  it("calculates allowanceLeft accurately matching contract logic", () => {
    // Closed returns 0
    expect(allowanceLeft(perPeriod, 50n, 0, 0, true)).toBe(0n);

    // Same period: returns perPeriod - drawn
    expect(allowanceLeft(perPeriod, 50_000_000_000_000_000n, 0, 0, false)).toBe(
      150_000_000_000_000_000n
    );

    // Cap fully exhausted in current period
    expect(allowanceLeft(perPeriod, perPeriod, 0, 0, false)).toBe(0n);

    // Crossed into new period (drawnPeriod 0 != currentPeriod 1): full refill
    expect(allowanceLeft(perPeriod, perPeriod, 0, 1, false)).toBe(perPeriod);

    // Skipped several periods: full refill
    expect(allowanceLeft(perPeriod, 50n, 0, 5, false)).toBe(perPeriod);
  });

  it("computes spendable as min of allowanceLeft and pot balance", () => {
    // Balance larger than allowance
    expect(spendable(100n, 500n)).toBe(100n);

    // Balance smaller than allowance (pot empty or low)
    expect(spendable(100n, 30n)).toBe(30n);

    // Equal
    expect(spendable(100n, 100n)).toBe(100n);

    // Zero balance
    expect(spendable(100n, 0n)).toBe(0n);
  });

  it("formats periods into human-readable descriptions", () => {
    expect(describePeriod(3600)).toBe("1 hour");
    expect(describePeriod(86400)).toBe("daily");
    expect(describePeriod(604800)).toBe("weekly");
    expect(describePeriod(1209600)).toBe("every 2 weeks");
    expect(describePeriod(2592000)).toBe("every 30 days");
    expect(describePeriod(86400 * 3)).toBe("every 3 days");
    expect(describePeriod(3600 * 5)).toBe("every 5 hours");
  });

  it("computes gaugeFractions accurately with clamping", () => {
    const fractions = gaugeFractions({
      allowanceLeft: 100_000_000_000_000_000n,
      perPeriod: 200_000_000_000_000_000n,
      balance: 400_000_000_000_000_000n,
    });

    expect(fractions.allowance).toBeCloseTo(0.5, 3);
    expect(fractions.pot).toBeCloseTo(1.0, 3);

    const empty = gaugeFractions({
      allowanceLeft: 0n,
      perPeriod: 200n,
      balance: 0n,
    });

    expect(empty.allowance).toBe(0);
    expect(empty.pot).toBe(0);
  });
});

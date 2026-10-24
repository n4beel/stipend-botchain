import { formatEther, parseEther } from "viem";

/**
 * Parsing and formatting for native BOT amounts typed by a user.
 *
 * `parseEther` is permissive in ways a payment form must not be: it accepts scientific notation,
 * signs, and whitespace, and rounds silently past 18 decimal places. Anything it accepts here goes
 * straight into a transaction's `value`, so the guard is a whitelist rather than a try/catch.
 *
 * BOT Chain's decimals are the EVM default of 18, per its docs and ChainList. No JSON-RPC method
 * reports native decimals, so this cannot be asserted from the node — it is worth eyeballing one
 * real balance against the explorer before the first mainnet send.
 */

/** Digits, optionally one decimal point, nothing else. No sign, no exponent, no separators. */
const DECIMAL = /^\d*\.?\d*$/;

const MAX_DECIMALS = 18;

/** Parse to wei, or null if the string is not an amount this app will send. */
export function parseNativeAmount(value: string): bigint | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "." || !DECIMAL.test(trimmed)) return null;

  // Past 18 places `parseEther` truncates without complaint, so the user would be shown one number
  // and send another.
  const [, fraction = ""] = trimmed.split(".");
  if (fraction.length > MAX_DECIMALS) return null;

  try {
    const wei = parseEther(trimmed);
    return wei > 0n ? wei : null;
  } catch {
    return null;
  }
}

/** Format wei for display, trimmed to `decimals` places without rounding up. */
export function formatNativeAmount(wei: bigint, decimals = 4): string {
  const full = formatEther(wei);
  if (!full.includes(".")) return full;
  const [whole, fraction] = full.split(".");
  const cut = fraction.slice(0, decimals).replace(/0+$/, "");
  return cut ? `${whole}.${cut}` : whole;
}

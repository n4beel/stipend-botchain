import { useEffect, useRef } from "react";
import { type Address, type PublicClient, formatEther } from "viem";
import { stipendAbi } from "@/lib/botchain/abi";

export interface StatusView {
  id: bigint;
  guardian: Address;
  beneficiary: Address;
  perPeriod: bigint;
  period: bigint;
  balance: bigint;
  startAt: bigint;
  closed: boolean;
  createdBlock: number;
  allowanceLeft: bigint;
  spendable: bigint;
  nextRefillAt: bigint;
  periodIndex: number;
}

export interface DrawRecord {
  id: bigint;
  beneficiary: Address;
  amount: bigint;
  allowanceLeft: bigint;
  balance: bigint;
  blockNumber: bigint;
  transactionHash: string;
}

/**
 * Calculates current period index: (now - startAt) / period
 */
export function periodIndex(
  startAt: bigint | number,
  period: bigint | number,
  nowSec?: bigint | number
): bigint {
  const s = BigInt(startAt);
  const p = BigInt(period);
  const n = nowSec !== undefined ? BigInt(nowSec) : BigInt(Math.floor(Date.now() / 1000));

  if (n < s || p === 0n) return 0n;
  return (n - s) / p;
}

/**
 * Calculates exact timestamp for the next refill: startAt + (periodIndex + 1) * period
 */
export function nextRefill(
  startAt: bigint | number,
  period: bigint | number,
  nowSec?: bigint | number
): bigint {
  const s = BigInt(startAt);
  const p = BigInt(period);
  const idx = periodIndex(s, p, nowSec);
  return s + (idx + 1n) * p;
}

/**
 * Calculates allowance left in current period matching contract logic.
 */
export function allowanceLeft(
  perPeriod: bigint,
  drawn: bigint,
  drawnPeriod: number | bigint,
  currentPeriod: number | bigint,
  closed: boolean
): bigint {
  if (closed) return 0n;
  if (BigInt(drawnPeriod) !== BigInt(currentPeriod)) return perPeriod;
  return perPeriod > drawn ? perPeriod - drawn : 0n;
}

/**
 * Computes spendable amount: min(allowanceLeft, balance).
 */
export function spendable(left: bigint, balance: bigint): bigint {
  return left < balance ? left : balance;
}

/**
 * Human-readable period descriptor.
 */
export function describePeriod(seconds: bigint | number): string {
  const sec = Number(seconds);
  if (sec === 3600) return "1 hour";
  if (sec === 86400) return "daily";
  if (sec === 604800) return "weekly";
  if (sec === 1209600) return "every 2 weeks";
  if (sec === 2592000) return "every 30 days";
  if (sec % 86400 === 0) {
    const days = sec / 86400;
    return `every ${days} days`;
  }
  if (sec % 3600 === 0) {
    const hours = sec / 3600;
    return `every ${hours} hours`;
  }
  return `${sec} seconds`;
}

/**
 * Computes fractions (0.0 to 1.0) for gauge fill visuals.
 */
export function gaugeFractions(status: {
  allowanceLeft: bigint;
  perPeriod: bigint;
  balance: bigint;
}): { allowance: number; pot: number } {
  const cap = Number(status.perPeriod);
  if (cap <= 0) return { allowance: 0, pot: 0 };

  const left = Number(status.allowanceLeft);
  const bal = Number(status.balance);

  const allowanceFrac = Math.max(0, Math.min(1, left / cap));
  // Pot indicator relative to 3x perPeriod or 1.0
  const potRef = cap * 2;
  const potFrac = Math.max(0, Math.min(1, bal / potRef));

  return {
    allowance: allowanceFrac,
    pot: potFrac,
  };
}

/**
 * Hook to schedule automatic in-page refetch right at the next refill boundary.
 * Uses a single timer and unmounts cleanly without polling.
 */
export function useRefillTimer(
  nextRefillAtSec: bigint | number | undefined,
  onRefill: () => void
) {
  const callbackRef = useRef(onRefill);
  callbackRef.current = onRefill;

  const targetSec = nextRefillAtSec ? Number(nextRefillAtSec) : 0;

  useEffect(() => {
    if (!targetSec || targetSec <= 0) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const delayMs = Math.max(1000, (targetSec - nowSec + 1) * 1000);

    // Limit maximum timeout to 24 days to prevent 32-bit int overflow in setTimeout
    if (delayMs > 24 * 86400 * 1000) return;

    const timer = setTimeout(() => {
      callbackRef.current();
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [targetSec]);
}

/**
 * Loads recent draw event logs for an allowance from createdBlock.
 */
export async function loadDraws(
  client: PublicClient | undefined,
  stipendAddress: Address | undefined,
  allowanceId: bigint,
  createdBlock: number
): Promise<DrawRecord[]> {
  if (!client || !stipendAddress || allowanceId <= 0n) return [];

  try {
    const fromBlock = createdBlock > 0 ? BigInt(createdBlock) : 0n;
    const logs = await client.getContractEvents({
      address: stipendAddress,
      abi: stipendAbi,
      eventName: "Drawn",
      args: {
        id: allowanceId,
      },
      fromBlock,
    });

    const records: DrawRecord[] = logs.map((log) => {
      const args = log.args as {
        id: bigint;
        beneficiary: Address;
        amount: bigint;
        allowanceLeft: bigint;
        balance: bigint;
      };
      return {
        id: args.id,
        beneficiary: args.beneficiary,
        amount: args.amount,
        allowanceLeft: args.allowanceLeft,
        balance: args.balance,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      };
    });

    // Newest first
    return records.reverse();
  } catch {
    return [];
  }
}

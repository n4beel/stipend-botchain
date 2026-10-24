import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { stipendAbi } from "@/lib/botchain/abi";
import {
  allowanceLeft as tsAllowanceLeft,
  nextRefill as tsNextRefill,
  periodIndex as tsPeriodIndex,
  spendable as tsSpendable,
} from "@/lib/stipend";
import { MAX_PERIOD, MIN_PERIOD } from "@/lib/limits";

const PORT = 8613;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968 as const;

const MNEMONIC = "test test test test test test test test test test test junk";
const accounts = Array.from({ length: 4 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let node: ChildProcess;
let publicClient: any;
let wallets: any[];
let stipendAddress: Address;

function revertDetails(
  err: unknown
): { errorName?: string; args?: readonly unknown[] } | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const found = err.walk(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      "data" in e &&
      Boolean((e as { data?: { errorName?: string } }).data?.errorName)
  ) as { data?: { errorName?: string; args?: readonly unknown[] } } | null;
  return found?.data;
}

beforeAll(async () => {
  node = spawn(
    "anvil",
    ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"],
    {
      stdio: ["ignore", "ignore", "inherit"],
    }
  );

  publicClient = createPublicClient({
    chain: local,
    transport: http(RPC),
  });

  wallets = accounts.map((acc) =>
    createWalletClient({
      account: acc,
      chain: local,
      transport: http(RPC),
    })
  );

  // Wait for node to be ready
  for (let i = 0; i < 40; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // Deploy Stipend contract
  const stipendArtifact = JSON.parse(
    readFileSync("contracts/out/Stipend.sol/Stipend.json", "utf8")
  );
  const hash = await wallets[0].deployContract({
    abi: stipendAbi,
    bytecode: stipendArtifact.bytecode.object as Hex,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  stipendAddress = receipt.contractAddress!;
});

afterAll(async () => {
  node?.kill();
});

describe("Stipend integration tests on Bohr local node", () => {
  it("deploys correctly with valid address", () => {
    expect(stipendAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it("verifies contract constants against lib/limits", async () => {
    const minPeriod = await publicClient.readContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "MIN_PERIOD",
    });
    const maxPeriod = await publicClient.readContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "MAX_PERIOD",
    });

    expect(minPeriod).toBe(MIN_PERIOD);
    expect(maxPeriod).toBe(MAX_PERIOD);
  });

  it("creates an allowance and checks status", async () => {
    const guardian = accounts[0].address;
    const beneficiary = accounts[1].address;
    const perPeriod = parseEther("0.2");
    const period = 86400n; // daily
    const initialPot = parseEther("1.0");

    const hash = await wallets[0].writeContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "create",
      args: [beneficiary, perPeriod, period, "Daily pocket money"],
      value: initialPot,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const status = await publicClient.readContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "status",
      args: [1n],
    });

    expect(status.id).toBe(1n);
    expect(status.guardian.toLowerCase()).toBe(guardian.toLowerCase());
    expect(status.beneficiary.toLowerCase()).toBe(beneficiary.toLowerCase());
    expect(status.perPeriod).toBe(perPeriod);
    expect(status.period).toBe(period);
    expect(status.balance).toBe(initialPot);
    expect(status.closed).toBe(false);
    expect(status.allowanceLeft).toBe(perPeriod);
    expect(status.spendable).toBe(perPeriod);
  });

  it("TS period and refill maths strictly match contract status across time", async () => {
    const status = await publicClient.readContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "status",
      args: [1n],
    });

    const block = await publicClient.getBlock();
    const nowSec = block.timestamp;

    const tsIdx = tsPeriodIndex(status.startAt, status.period, nowSec);
    const tsRefill = tsNextRefill(status.startAt, status.period, nowSec);

    expect(tsIdx).toBe(BigInt(status.periodIndex));
    expect(tsRefill).toBe(status.nextRefillAt);
  });

  it("draws within cap and delivers BOT to beneficiary", async () => {
    const beneficiary = accounts[1].address;
    const drawAmount = parseEther("0.05");

    const balBefore = await publicClient.getBalance({ address: beneficiary });

    const hash = await wallets[1].writeContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "draw",
      args: [1n, drawAmount],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const balAfter = await publicClient.getBalance({ address: beneficiary });
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;
    expect(balAfter + gasUsed - balBefore).toBe(drawAmount);

    const status = await publicClient.readContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "status",
      args: [1n],
    });

    expect(status.allowanceLeft).toBe(parseEther("0.15"));
    expect(status.balance).toBe(parseEther("0.95"));
    expect(status.spendable).toBe(parseEther("0.15"));
  });

  it("reverts OverAllowance when drawing more than remaining cap", async () => {
    // Allowance remaining is 0.15 BOT; trying to draw 0.16 BOT
    try {
      await wallets[1].writeContract({
        address: stipendAddress,
        abi: stipendAbi,
        functionName: "draw",
        args: [1n, parseEther("0.16")],
      });
      expect.fail("should have reverted");
    } catch (err: any) {
      const details = revertDetails(err);
      expect(details?.errorName).toBe("OverAllowance");
      expect(details?.args?.[0]).toBe(parseEther("0.15"));
    }
  });

  it("reverts NotBeneficiary when caller is not the beneficiary", async () => {
    try {
      await wallets[0].writeContract({
        address: stipendAddress,
        abi: stipendAbi,
        functionName: "draw",
        args: [1n, parseEther("0.01")],
      });
      expect.fail("should have reverted");
    } catch (err: any) {
      const details = revertDetails(err);
      expect(details?.errorName).toBe("NotBeneficiary");
    }
  });

  it("rolls the period upon time advance and refills the cap without rollover", async () => {
    // Warp forward 1 day (86400 seconds)
    await publicClient.request({
      method: "evm_increaseTime",
      params: [86401],
    });
    await publicClient.request({
      method: "evm_mine",
      params: [],
    });

    const status = await publicClient.readContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "status",
      args: [1n],
    });

    // Allowance refilled to full 0.2 BOT (unused 0.15 did not carry over)
    expect(status.periodIndex).toBe(1);
    expect(status.allowanceLeft).toBe(parseEther("0.2"));
    expect(status.spendable).toBe(parseEther("0.2"));

    // Beneficiary can draw full 0.2 BOT in period 1
    const hash = await wallets[1].writeContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "draw",
      args: [1n, parseEther("0.2")],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const statusAfter = await publicClient.readContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "status",
      args: [1n],
    });
    expect(statusAfter.allowanceLeft).toBe(0n);
    expect(statusAfter.balance).toBe(parseEther("0.75")); // 0.95 - 0.20
  });

  it("tops up the allowance by third party", async () => {
    const topUpAmount = parseEther("0.25");
    const hash = await wallets[2].writeContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "topUp",
      args: [1n],
      value: topUpAmount,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const status = await publicClient.readContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "status",
      args: [1n],
    });

    expect(status.balance).toBe(parseEther("1.0")); // 0.75 + 0.25
  });

  it("guardian closes allowance and receives remaining pot balance", async () => {
    const guardian = accounts[0].address;
    const balBefore = await publicClient.getBalance({ address: guardian });

    const hash = await wallets[0].writeContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "close",
      args: [1n],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const balAfter = await publicClient.getBalance({ address: guardian });
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;
    // 1.0 BOT was in pot
    expect(balAfter + gasUsed - balBefore).toBe(parseEther("1.0"));

    const status = await publicClient.readContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "status",
      args: [1n],
    });
    expect(status.closed).toBe(true);
    expect(status.balance).toBe(0n);
    expect(status.allowanceLeft).toBe(0n);
    expect(status.spendable).toBe(0n);
  });

  it("returns paginated allowancesFor for both roles", async () => {
    // Create allowance 2 from account 1 to account 0
    await wallets[1].writeContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "create",
      args: [accounts[0].address, parseEther("0.1"), 86400n, "Allowance two"],
      value: parseEther("0.5"),
    });

    const for0 = await publicClient.readContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "allowancesFor",
      args: [accounts[0].address, 0n, 10n],
    });

    // Account 0 was guardian of #1 and beneficiary of #2
    expect(for0.length).toBe(2);
    expect(for0[0].id).toBe(2n); // newest first
    expect(for0[1].id).toBe(1n);
  });

  it("measures gas ceilings for all operations", async () => {
    // Create gas
    const hCreate = await wallets[0].writeContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "create",
      args: [accounts[3].address, parseEther("0.05"), 3600n, "Gas check"],
      value: parseEther("0.5"),
    });
    const rCreate = await publicClient.waitForTransactionReceipt({ hash: hCreate });
    expect(rCreate.gasUsed).toBeLessThan(230000n);

    // Draw gas
    const hDraw = await wallets[3].writeContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "draw",
      args: [3n, parseEther("0.01")],
    });
    const rDraw = await publicClient.waitForTransactionReceipt({ hash: hDraw });
    expect(rDraw.gasUsed).toBeLessThan(90000n);

    // Close gas
    const hClose = await wallets[0].writeContract({
      address: stipendAddress,
      abi: stipendAbi,
      functionName: "close",
      args: [3n],
    });
    const rClose = await publicClient.waitForTransactionReceipt({ hash: hClose });
    expect(rClose.gasUsed).toBeLessThan(80000n);
  });
});

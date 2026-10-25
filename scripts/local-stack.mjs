/**
 * Local stack runner and seeder for Stipend.
 *
 * Spawns anvil on port 8713 with chain id 968, deploys Stipend,
 * and seeds the 6 scenarios from 13-stipend.md §5:
 * (1) account 0 is beneficiary — weekly 0.2 BOT, 0.08 drawn this week, balance 1.5
 * (2) account 0 is guardian of account 1 — daily 0.05, balance 0.4, a refill has just happened
 * (3) closed with a return
 * (4) cap exhausted this period (refill in hours)
 * (5) pot empty
 * (6) account 0 beneficiary of a monthly allowance in its second period after skipping one
 *
 * Usage:
 *   node scripts/local-stack.mjs
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseEther,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

const PORT = 8713;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const MNEMONIC = "test test test test test test test test test test test junk";

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

const TOTAL_WARP = 65 * 86400; // 65 days
const realNow = Math.floor(Date.now() / 1000);
const startTimestamp = realNow - TOTAL_WARP;

console.log(`Starting anvil on port ${PORT} (timestamp: ${startTimestamp})...`);
spawn(
  "anvil",
  [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "10",
    "--timestamp",
    String(startTimestamp),
    "--block-time",
    "1",
    "--silent",
  ],
  {
    detached: true,
    stdio: "ignore",
  }
).unref();

const pub = createPublicClient({ chain: local, transport: http() });

const accounts = Array.from({ length: 10 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);

const wallets = accounts.map((account) =>
  createWalletClient({ account, chain: local, transport: http() })
);

async function waitNode() {
  for (let i = 0; i < 40; i++) {
    try {
      await pub.getBlockNumber();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("Local anvil node failed to respond.");
}

async function warpTo(targetTimestamp) {
  const currentBlock = await pub.getBlock();
  const current = Number(currentBlock.timestamp);
  const delta = targetTimestamp - current;
  if (delta > 0) {
    await pub.request({ method: "evm_increaseTime", params: [delta] });
    await pub.request({ method: "evm_mine", params: [] });
  }
}

async function main() {
  await waitNode();
  console.log("Anvil running.");

  const stipendArtifact = JSON.parse(
    readFileSync("contracts/out/Stipend.sol/Stipend.json", "utf8")
  );
  const abi = stipendArtifact.abi;
  const bytecode = stipendArtifact.bytecode.object;

  console.log("Deploying Stipend...");
  const deployHash = await wallets[0].deployContract({ abi, bytecode });
  const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployHash });
  const stipendAddress = getAddress(deployReceipt.contractAddress);
  const deployBlock = deployReceipt.blockNumber;
  console.log(`Stipend deployed at ${stipendAddress} (block ${deployBlock})`);

  console.log("\nSeeding 6 scenarios chronologically from §5...");

  // Scenario 6: account 0 beneficiary of a monthly allowance in its second period after skipping one
  // Created at startTimestamp (65 days ago). Period = 30 days (2592000s).
  console.log("1. Monthly allowance skipped into period 2 (Acc 0 beneficiary)...");
  const h6 = await wallets[3].writeContract({
    address: stipendAddress,
    abi,
    functionName: "create",
    args: [accounts[0].address, parseEther("0.5"), 2592000n, "Monthly dev grant"],
    value: parseEther("2.0"),
  });
  await pub.waitForTransactionReceipt({ hash: h6 });

  // Warp to 2 days before realNow
  await warpTo(realNow - 2 * 86400);

  // Scenario 1: account 0 is beneficiary — weekly 0.2 BOT, 0.08 drawn this week, balance 1.5
  console.log("2. Weekly allowance for Account 0 (0.2 cap, 0.08 drawn, 1.5 pot)...");
  const h1 = await wallets[1].writeContract({
    address: stipendAddress,
    abi,
    functionName: "create",
    args: [accounts[0].address, parseEther("0.2"), 604800n, "Weekly spending"],
    value: parseEther("1.58"),
  });
  await pub.waitForTransactionReceipt({ hash: h1 });
  const h1d = await wallets[0].writeContract({
    address: stipendAddress,
    abi,
    functionName: "draw",
    args: [2n, parseEther("0.08")],
  });
  await pub.waitForTransactionReceipt({ hash: h1d });

  // Warp to 24 hours 5 minutes before realNow (-86700s)
  await warpTo(realNow - 86700);

  // Scenario 2: account 0 is guardian of account 1 — daily 0.05, balance 0.4, a refill has just happened
  console.log("3. Daily allowance given to Account 1 (0.05 cap, 0.4 pot, refilled)...");
  const h2 = await wallets[0].writeContract({
    address: stipendAddress,
    abi,
    functionName: "create",
    args: [accounts[1].address, parseEther("0.05"), 86400n, "Daily lunch stipend"],
    value: parseEther("0.45"),
  });
  await pub.waitForTransactionReceipt({ hash: h2 });
  const h2d = await wallets[1].writeContract({
    address: stipendAddress,
    abi,
    functionName: "draw",
    args: [3n, parseEther("0.05")],
  });
  await pub.waitForTransactionReceipt({ hash: h2d });

  // Warp to 18 hours before realNow
  await warpTo(realNow - 18 * 3600);

  // Scenario 4: cap exhausted this period (refill in hours)
  console.log("4. Allowance with cap fully exhausted this period (Acc 3 beneficiary, refill in 6h)...");
  const h4 = await wallets[0].writeContract({
    address: stipendAddress,
    abi,
    functionName: "create",
    args: [accounts[3].address, parseEther("0.15"), 86400n, "Software subscriptions"],
    value: parseEther("0.6"),
  });
  await pub.waitForTransactionReceipt({ hash: h4 });
  const h4d = await wallets[3].writeContract({
    address: stipendAddress,
    abi,
    functionName: "draw",
    args: [4n, parseEther("0.15")],
  });
  await pub.waitForTransactionReceipt({ hash: h4d });

  // Warp to 120s before realNow
  await warpTo(realNow - 120);

  // Scenario 5: pot empty (0 balance remaining)
  console.log("5. Empty pot (Acc 0 beneficiary)...");
  const h5 = await wallets[2].writeContract({
    address: stipendAddress,
    abi,
    functionName: "create",
    args: [accounts[0].address, parseEther("0.1"), 86400n, "Empty allowance"],
    value: parseEther("0.05"),
  });
  await pub.waitForTransactionReceipt({ hash: h5 });
  const h5d = await wallets[0].writeContract({
    address: stipendAddress,
    abi,
    functionName: "draw",
    args: [5n, parseEther("0.05")],
  });
  await pub.waitForTransactionReceipt({ hash: h5d });

  // Scenario 3: closed with a return
  console.log("6. Closed allowance with returned pot balance (Acc 0 guardian)...");
  const h3 = await wallets[0].writeContract({
    address: stipendAddress,
    abi,
    functionName: "create",
    args: [accounts[2].address, parseEther("0.1"), 86400n, "Old research stipend"],
    value: parseEther("0.5"),
  });
  await pub.waitForTransactionReceipt({ hash: h3 });
  const h3c = await wallets[0].writeContract({
    address: stipendAddress,
    abi,
    functionName: "close",
    args: [6n],
  });
  await pub.waitForTransactionReceipt({ hash: h3c });

  // Warp to current wall clock time
  await warpTo(Math.floor(Date.now() / 1000));

  // Assert final chain timestamp within 120s of wall clock
  const finalBlock = await pub.getBlock();
  const currentWallTime = Math.floor(Date.now() / 1000);
  const diff = Math.abs(Number(finalBlock.timestamp) - currentWallTime);
  console.log(`\nFinal chain timestamp: ${finalBlock.timestamp} (real: ${currentWallTime}, diff: ${diff}s)`);
  if (diff > 120) {
    throw new Error(`Chain timestamp skewed by ${diff}s, expected <= 120s`);
  }

  // Write .env.local
  const envContent = [
    `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet`,
    `NEXT_PUBLIC_BOHR_RPC=${RPC}`,
    `NEXT_PUBLIC_CONTRACT_968=${stipendAddress}`,
    `NEXT_PUBLIC_DEPLOY_BLOCK_968=${deployBlock}`,
    `NEXT_PUBLIC_CHAIN_ID=968`,
    `NEXT_PUBLIC_RPC_URL=${RPC}`,
  ].join("\n");
  writeFileSync(".env.local", envContent + "\n");
  console.log("Updated .env.local with deployed contract addresses.");

  console.log("\n========================================================");
  console.log(`Stipend Local Stack Running on ${RPC}`);
  console.log("========================================================");
  console.log("Account Role Table:");
  console.log("--------------------------------------------------------");
  console.log(`Acc 0: ${accounts[0].address} (Beneficiary of #1, #2, #5; Guardian of #3, #4, #6)`);
  console.log(`Acc 1: ${accounts[1].address} (Guardian of #2; Beneficiary of #3)`);
  console.log(`Acc 2: ${accounts[2].address} (Guardian of #5; Beneficiary of #6)`);
  console.log(`Acc 3: ${accounts[3].address} (Guardian of #1; Beneficiary of #4)`);
  console.log("--------------------------------------------------------");
  console.log("Seeded scenarios:");
  console.log("1. Acc 0 beneficiary: monthly allowance in period 2 after skipping one (2.0 pot)");
  console.log("2. Acc 0 beneficiary: weekly allowance (0.2 cap, 0.08 drawn, 1.5 pot)");
  console.log("3. Acc 0 guardian: daily allowance to Acc 1 (0.05 cap, 0.4 pot, refilled)");
  console.log("4. Acc 0 guardian: daily allowance to Acc 3 (0.15 cap, exhausted, refills in ~6h)");
  console.log("5. Acc 0 beneficiary: empty pot (0 balance)");
  console.log("6. Acc 0 guardian: closed allowance (returned 0.5 BOT)");
  console.log("--------------------------------------------------------");
  console.log("Local stack ready!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Local stack setup failed:", err);
  process.exit(1);
});

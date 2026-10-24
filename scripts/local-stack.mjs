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

import { spawn } from "node:child_process";
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

console.log(`Starting anvil on port ${PORT}...`);
spawn(
  "anvil",
  ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--accounts", "10", "--silent"],
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

  // Write .env.local
  const envContent = [
    `NEXT_PUBLIC_CONTRACT_968=${stipendAddress}`,
    `NEXT_PUBLIC_DEPLOY_BLOCK_968=${deployBlock}`,
    `NEXT_PUBLIC_LOCAL_RPC=${RPC}`,
    "",
  ].join("\n");
  writeFileSync(".env.local", envContent);
  console.log("Wrote .env.local with deployment configuration.");

  console.log("\nSeeding 6 scenarios from §5...");

  // Scenario 1: account 0 is beneficiary — weekly 0.2 BOT, 0.08 drawn this week, balance 1.5
  // Guardian is account 1
  console.log("Seeding Scenario 1: Weekly allowance for Account 0 (0.2 cap, 0.08 drawn, 1.5 pot)");
  const h1 = await wallets[1].writeContract({
    address: stipendAddress,
    abi,
    functionName: "create",
    args: [accounts[0].address, parseEther("0.2"), 604800n, "Weekly spending"],
    value: parseEther("1.5"),
  });
  await pub.waitForTransactionReceipt({ hash: h1 });
  // Account 0 draws 0.08 BOT
  const h1d = await wallets[0].writeContract({
    address: stipendAddress,
    abi,
    functionName: "draw",
    args: [1n, parseEther("0.08")],
  });
  await pub.waitForTransactionReceipt({ hash: h1d });

  // Scenario 2: account 0 is guardian of account 1 — daily 0.05, balance 0.4, a refill has just happened
  console.log("Seeding Scenario 2: Daily allowance given to Account 1 (0.05 cap, 0.4 pot, refilled)");
  const h2 = await wallets[0].writeContract({
    address: stipendAddress,
    abi,
    functionName: "create",
    args: [accounts[1].address, parseEther("0.05"), 86400n, "Daily lunch stipend"],
    value: parseEther("0.4"),
  });
  await pub.waitForTransactionReceipt({ hash: h2 });
  // Account 1 draws in period 0
  const h2d = await wallets[1].writeContract({
    address: stipendAddress,
    abi,
    functionName: "draw",
    args: [2n, parseEther("0.05")],
  });
  await pub.waitForTransactionReceipt({ hash: h2d });
  // Advance time by 86401 seconds to trigger refill into period 1
  await pub.request({ method: "evm_increaseTime", params: [86401] });
  await pub.request({ method: "evm_mine", params: [] });

  // Scenario 3: closed with a return
  console.log("Seeding Scenario 3: Closed allowance with returned pot balance");
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
    args: [3n],
  });
  await pub.waitForTransactionReceipt({ hash: h3c });

  // Scenario 4: cap exhausted this period (refill in hours)
  console.log("Seeding Scenario 4: Allowance with cap fully exhausted this period");
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

  // Scenario 5: pot empty (0 balance remaining)
  console.log("Seeding Scenario 5: Empty pot");
  const h5 = await wallets[2].writeContract({
    address: stipendAddress,
    abi,
    functionName: "create",
    args: [accounts[0].address, parseEther("0.05"), 86400n, "Empty allowance"],
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

  // Scenario 6: account 0 beneficiary of a monthly allowance in its second period after skipping one
  console.log("Seeding Scenario 6: Monthly allowance skipped into period 2");
  const h6 = await wallets[3].writeContract({
    address: stipendAddress,
    abi,
    functionName: "create",
    args: [accounts[0].address, parseEther("0.5"), 2592000n, "Monthly dev grant"],
    value: parseEther("2.0"),
  });
  await pub.waitForTransactionReceipt({ hash: h6 });
  // Skip forward 2 months (2 * 2592000 = 5184000)
  await pub.request({ method: "evm_increaseTime", params: [5184001] });
  await pub.request({ method: "evm_mine", params: [] });

  console.log("\nAll 6 scenarios seeded successfully!");
  console.log(`Ready for local development at http://localhost:3000`);
}

main().catch((err) => {
  console.error("Local stack setup failed:", err);
  process.exit(1);
});

/**
 * Pre-flight against the real networks. No wallet, no contracts, no browser.
 *
 * Mainnet BOT has no faucet, so the last thing anyone should do is discover a wrong chain ID or an
 * empty deployer the first time real money is at stake. This asks the nodes directly:
 *
 *   node scripts/check-chain.mjs              # both networks, identity + liveness
 *   node scripts/check-chain.mjs --deployer   # also the balance of DEPLOYER_PRIVATE_KEY's address
 *   node scripts/check-chain.mjs --gas 120000 # also what that much gas costs, in BOT
 *
 * Exits non-zero if anything a deploy depends on is wrong, so it can gate a deploy script.
 */

import { createPublicClient, http, formatEther, formatGwei } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { botChain, bohrTestnet } from "../lib/botchain/chain.ts";

const args = process.argv.slice(2);
const wantDeployer = args.includes("--deployer");
const gasIndex = args.indexOf("--gas");
const gasUnits = gasIndex === -1 ? null : BigInt(args[gasIndex + 1] ?? "0");

let failed = false;

function ok(label, value) {
  console.log(`  \u001b[32m✓\u001b[0m ${label.padEnd(22)} ${value}`);
}
function bad(label, value) {
  failed = true;
  console.log(`  \u001b[31m✗\u001b[0m ${label.padEnd(22)} ${value}`);
}
function note(label, value) {
  console.log(`    ${label.padEnd(22)} ${value}`);
}

for (const chain of [bohrTestnet, botChain]) {
  console.log(`\n\u001b[1m${chain.name}\u001b[0m  (expects chain id ${chain.id})`);
  const client = createPublicClient({ chain, transport: http(undefined, { timeout: 20_000 }) });

  let reportedId;
  try {
    reportedId = await client.getChainId();
  } catch (err) {
    bad("rpc", `unreachable — ${err.shortMessage ?? err.message}`);
    continue;
  }

  // The one check worth the whole file. A node that answers but reports a different chain ID than
  // the app was built for signs transactions that are valid somewhere else.
  if (reportedId === chain.id) ok("chain id", reportedId);
  else bad("chain id", `node says ${reportedId}, config says ${chain.id}`);

  try {
    const block = await client.getBlock();
    ok("head", `#${block.number}  ${new Date(Number(block.timestamp) * 1000).toISOString()}`);

    // Stale heads are the failure mode a plain chain-id check misses: the node answers, the ID is
    // right, and every read is minutes out of date.
    const age = Math.floor(Date.now() / 1000) - Number(block.timestamp);
    if (age > 120) bad("head age", `${age}s — node is behind`);
    else ok("head age", `${age}s`);
  } catch (err) {
    bad("head", err.shortMessage ?? err.message);
  }

  try {
    const gasPrice = await client.getGasPrice();
    ok("gas price", `${formatGwei(gasPrice)} gwei`);
    if (gasUnits) {
      note(`cost of ${gasUnits} gas`, `${formatEther(gasPrice * gasUnits)} ${chain.nativeCurrency.symbol}`);
    }
  } catch (err) {
    bad("gas price", err.shortMessage ?? err.message);
  }

  if (wantDeployer) {
    const key = process.env.DEPLOYER_PRIVATE_KEY;
    if (!key) {
      bad("deployer", "DEPLOYER_PRIVATE_KEY is not set");
    } else {
      try {
        const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
        const balance = await client.getBalance({ address: account.address });
        const human = `${formatEther(balance)} ${chain.nativeCurrency.symbol}`;
        if (balance === 0n) bad("deployer", `${account.address} — empty`);
        else ok("deployer", `${account.address}  ${human}`);
      } catch (err) {
        bad("deployer", err.shortMessage ?? err.message);
      }
    }
  }
}

console.log();
if (failed) {
  console.log("\u001b[31mSomething a deploy depends on is wrong. Fix it before spending gas.\u001b[0m");
  process.exit(1);
}
console.log("\u001b[32mBoth networks look deployable.\u001b[0m");

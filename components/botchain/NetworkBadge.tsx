"use client";

import { useAccount, useChainId } from "wagmi";
import { activeBotChain, botChain, isActiveChain, isBotChainId } from "@/lib/botchain/chain";

/**
 * Which network the user is actually on, and whether it is the one this app runs on.
 *
 * It says "Testnet" in amber on Bohr for one reason: the listing bar is mainnet-only, and a
 * screenshot of a testnet transaction submitted as proof is a wasted submission. The label makes
 * that impossible to miss.
 *
 * `isConnected` is checked rather than trusting `useChainId` alone. With no wallet, wagmi reports
 * the config's first chain, which is a real BOT Chain ID and so passes `isBotChainId` — it is just
 * not the user's. `WAGMI_CHAINS` puts the build's target first so the two agree, and this is the
 * belt to that braces: the badge says what the build targets until a wallet says otherwise.
 *
 * The third state matters as much as the other two. A wallet connected to the OTHER BOT Chain
 * network used to make this badge simply flip its label, which read as the app changing its mind
 * rather than as a mismatch the user has to fix.
 */
export default function NetworkBadge() {
  const chainId = useChainId();
  const { isConnected } = useAccount();

  const mismatched = isConnected && !isActiveChain(chainId);
  const shown = isConnected && isBotChainId(chainId) ? chainId : activeBotChain.id;
  const mainnet = shown === botChain.id;
  const warn = mismatched || !mainnet;

  const label = mismatched ? "Wrong network" : mainnet ? "Mainnet" : "Testnet";
  const title = mismatched
    ? `This app runs on ${activeBotChain.name}. Your wallet is on another network — switch it to continue.`
    : mainnet
      ? "BOT Chain mainnet (677)"
      : "Bohr testnet (968) — not mainnet";

  return (
    <span
      className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-[0.06em] flex-shrink-0"
      style={{
        borderRadius: "2px",
        border: `1px solid ${warn ? "var(--warning)" : "var(--border-default)"}`,
        color: warn ? "var(--warning)" : "var(--text-secondary)",
      }}
      title={title}
    >
      {label}
    </span>
  );
}

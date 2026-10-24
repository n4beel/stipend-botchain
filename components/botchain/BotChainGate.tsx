"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useConnect, useSwitchChain } from "wagmi";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import ConnectButton from "@/components/ui/ConnectButton";
import { activeBotChain, botChainById, faucetUrl, isActiveChain, isBotChainId } from "@/lib/botchain/chain";
import { isDeployed } from "@/lib/botchain/deployment";
import { useToast } from "@/components/ui/Toast";
import { hasInjectedWallet, WALLET_INSTALL_URL } from "@/lib/wallet";

/**
 * The preconditions every on-chain screen shares, in one place.
 *
 * Each of these is a state a user can genuinely land in, and each has a different answer.
 * Rendering a form to someone on the wrong network, or one pointed at a contract address that is
 * all zeroes, produces a failure the user cannot diagnose — so nothing renders until the path is
 * real.
 *
 * Wrap only the parts of a page that transact. A read-only view — verifying a record, reading a
 * public certificate — should render for a visitor with no wallet at all, so it goes outside.
 */
export default function BotChainGate({
  children,
  noWalletNote,
}: {
  children: React.ReactNode;
  /**
   * What still works without a wallet, in this app's own words.
   *
   * It exists because the default was once Seal's copy — "hashing a file still works, but sealing
   * needs a wallet" — which every project that copied the template then told its users, including
   * the ones that never hash anything. A shared component must not assert what a particular app
   * does, so the default says only what is true everywhere and each app can say more.
   */
  noWalletNote?: React.ReactNode;
}) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const { toast } = useToast();
  const { connectors } = useConnect();

  // Rendered only after mount. The server has no idea what the visitor has installed, so deciding
  // this during SSR would ship "no wallet" HTML to everyone and then correct it, which flashes.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (mounted && !isConnected && !hasInjectedWallet(connectors.map((c) => c.id))) {
    return (
      <Notice title="No wallet found">
        <p className="mb-3">
          This browser has no Ethereum wallet extension, so there is nothing for{" "}
          {activeBotChain.name} to connect to.{" "}
          {noWalletNote ?? "Anything here that only reads the chain still works; signing a transaction needs a wallet."}
        </p>
        <p className="mb-4">
          Install MetaMask, or open this page in a browser that already has it.
        </p>
        <a
          href={WALLET_INSTALL_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center px-3 py-1.5 text-[11px] uppercase tracking-[0.04em] no-underline"
          style={{ borderRadius: "2px", border: "1px solid var(--accent)", color: "var(--accent)" }}
        >
          Install MetaMask
        </a>
      </Notice>
    );
  }

  if (!isConnected) {
    // The connect control renders here rather than a pointer at the header. On a phone the header
    // is cramped, so "connect from the top right" asked the user to hunt for the wallet before
    // they could do the one thing the screen wanted.
    return (
      <Notice title="Wallet not connected">
        <p className="mb-4">Connect an EVM wallet to use {activeBotChain.name}.</p>
        <div style={{ maxWidth: "220px" }}>
          <ConnectButton />
        </div>
      </Notice>
    );
  }

  // The app's OWN network, not merely "a BOT Chain network".
  //
  // This used to accept either chain, because both are BOT Chain and `isBotChainId` says so. The
  // result on a mainnet build was that a wallet left on Bohr sailed through the gate and the app
  // quietly read and wrote the testnet contract — the only outward sign being the network badge
  // flipping from Mainnet to Testnet the moment the wallet connected. Two networks that share a
  // codebase are still two networks, and a deal signed on the wrong one is simply lost.
  if (!isActiveChain(chainId)) {
    const onOtherBotChain = isBotChainId(chainId);
    return (
      <Notice title="Wrong network">
        <p className="mb-4">
          {onOtherBotChain ? (
            <>
              Your wallet is on {botChainById(chainId).name}, but
              this app runs on {activeBotChain.name}. They are separate chains: contracts and
              balances on one do not exist on the other.
            </>
          ) : (
            <>Your wallet is on another network. Switch to {activeBotChain.name} to continue.</>
          )}
        </p>
        <Button
          size="sm"
          variant="ghost"
          loading={isPending}
          onClick={() =>
            switchChain(
              { chainId: activeBotChain.id },
              {
                // Without this the button spins once and stops, which is the same dead-end the
                // connect button had: a wallet that refuses to add the network says nothing.
                onError: (err) =>
                  toast(
                    "error",
                    `Could not switch to ${activeBotChain.name}`,
                    err instanceof Error ? err.message : "Your wallet declined the request.",
                  ),
              },
            )
          }
          style={{ borderColor: "var(--warning)", color: "var(--warning)" }}
        >
          Switch to {activeBotChain.name}
        </Button>
      </Notice>
    );
  }

  if (!isDeployed(chainId)) {
    const faucet = faucetUrl(chainId);
    return (
      <Notice title="Contract not deployed">
        <p className="mb-3">
          No contract address is configured for {activeBotChain.name}. Deploy with{" "}
          <code style={{ color: "var(--text-secondary)" }}>contracts/script/Deploy.s.sol</code>,
          then set the{" "}
          <code style={{ color: "var(--text-secondary)" }}>NEXT_PUBLIC_CONTRACT_{chainId}</code>{" "}
          and{" "}
          <code style={{ color: "var(--text-secondary)" }}>
            NEXT_PUBLIC_DEPLOY_BLOCK_{chainId}
          </code>{" "}
          variables the script prints.
        </p>
        {faucet && (
          <p style={{ color: "var(--text-tertiary)" }}>
            Test funds:{" "}
            <a href={faucet} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
              {faucet}
            </a>
          </p>
        )}
      </Notice>
    );
  }

  return <>{children}</>;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: "480px" }}>
      <Panel>
        <p
          className="text-[11px] uppercase tracking-[0.04em] mb-2"
          style={{ color: "var(--text-secondary)" }}
        >
          {title}
        </p>
        <div className="text-[12px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          {children}
        </div>
      </Panel>
    </div>
  );
}

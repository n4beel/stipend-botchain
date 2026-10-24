"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useBalance } from "wagmi";
import { formatUnits } from "viem";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Button from "./Button";
import { activeBotChain, isBotChainId } from "@/lib/botchain/chain";
import { useToast } from "./Toast";
import { hasInjectedWallet, WALLET_INSTALL_URL } from "@/lib/wallet";

function truncate(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * A wallet error in words a user can act on.
 *
 * Wallet errors arrive in several shapes — a viem `BaseError` with a `shortMessage`, a plain
 * `Error`, or an EIP-1193 object carrying only a numeric `code`. Rejection is by far the most
 * common and is not a failure worth alarming language.
 */
function describe(err: unknown): string {
  const code = typeof err === "object" && err !== null && "code" in err ? (err as { code: unknown }).code : undefined;
  if (code === 4001) return "You dismissed the request in your wallet.";
  if (code === 4902) return `${activeBotChain.name} is not in your wallet, and it declined to add it.`;

  const message =
    typeof err === "object" && err !== null && "shortMessage" in err
      ? String((err as { shortMessage: unknown }).shortMessage)
      : err instanceof Error
        ? err.message
        : String(err);

  if (/rejected|denied|cancell?ed/i.test(message)) return "You dismissed the request in your wallet.";
  return message;
}

const menuContentStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-default)",
  borderRadius: "2px",
} as const;

const menuItemClass =
  "flex items-center gap-3 px-4 py-2.5 text-[13px] cursor-pointer outline-none transition-colors";

/**
 * Connect state for the whole app: connect, wrong-network, and connected-with-balance.
 *
 * Rendered in the header, and again inside `BotChainGate` so a user who lands on a transacting
 * screen can connect without hunting for it.
 */
export default function ConnectButton() {
  const { address, isConnected, chainId, connector } = useAccount();
  const { toast } = useToast();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: balance } = useBalance({
    address,
    query: { enabled: Boolean(address) && isBotChainId(chainId) },
  });

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleSwitch = useCallback(() => {
    switchChain(
      { chainId: activeBotChain.id },
      {
        onError: (err) =>
          toast("error", `Could not switch to ${activeBotChain.name}`, describe(err)),
      },
    );
  }, [switchChain, toast]);

  /**
   * Connect, and say so when it fails.
   *
   * Two deliberate choices here, both from a wallet that did nothing when clicked:
   *
   * `chainId` is not passed. Asking wagmi to connect *and* land on a specific chain makes it add
   * an unknown network as part of connecting, and a wallet that will not do that — Firefox's
   * MetaMask among them — fails the whole connect rather than connecting on the chain it is
   * already on. Connecting first and switching second gives each step its own prompt and its own
   * visible error, and `BotChainGate` already renders the switch.
   *
   * The error is surfaced. `useConnect` is a mutation, so a rejected connect settles into mutation
   * state and never reaches the console — which is precisely how this presented: a button that
   * looked dead, in one browser, with nothing logged anywhere.
   */
  const handleConnect = useCallback(
    (connector: (typeof connectors)[number]) => {
      connect(
        { connector },
        {
          onError: (err) => toast("error", "Could not connect", describe(err)),
        },
      );
    },
    [connect, toast],
  );

  if (!mounted) {
    return (
      <button
        className="w-full px-3 py-1.5 text-[11px] font-medium tracking-[0.02em] uppercase"
        style={{
          borderRadius: "2px",
          border: "1px solid var(--border-default)",
          color: "var(--text-secondary)",
          background: "transparent",
        }}
        disabled
      >
        Connect Wallet
      </button>
    );
  }

  if (isPending) {
    return (
      <Button variant="ghost" size="sm" loading className="w-full">
        Connecting
      </Button>
    );
  }

  // Connected but pointed at some other network. Nothing else should render until this is fixed,
  // otherwise the user signs a transaction against the wrong chain.
  //
  // Which wallet, and a way out, both matter here. With more than one EVM extension installed —
  // Phantom also injects one — wagmi reconnects to whichever was last authorised, which may not be
  // the one the user meant. Without the name and the disconnect this state reads as "not connected"
  // and there is nothing to click but a switch that changes the wrong wallet's network.
  if (isConnected && !isBotChainId(chainId)) {
    return (
      <div className="w-full flex flex-col gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={handleSwitch}
          loading={isSwitching}
          style={{ borderColor: "var(--warning)", color: "var(--warning)" }}
        >
          Switch to {activeBotChain.name}
        </Button>
        <div className="flex items-center justify-between gap-2 px-0.5">
          <span
            className="text-[10px] font-mono truncate"
            style={{ color: "var(--text-tertiary)" }}
            title={address}
          >
            {connector?.name ?? "Connected"}
            {address ? ` · ${truncate(address)}` : ""}
          </span>
          <button
            onClick={() => disconnect()}
            className="text-[10px] uppercase tracking-[0.04em] flex-shrink-0"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-tertiary)",
              cursor: "pointer",
            }}
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  if (isConnected && address) {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors"
            style={{ borderRadius: "2px", border: "1px solid var(--border-default)" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: "var(--success)" }}
            />
            <span
              className="font-mono text-[12px] truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {truncate(address)}
            </span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            className="mt-1 w-52 overflow-hidden z-50"
            style={menuContentStyle}
          >
            {balance && (
              <div
                className="px-4 py-2.5 text-[12px] font-mono"
                style={{ color: "var(--text-tertiary)" }}
              >
                {Number(formatUnits(balance.value, balance.decimals)).toFixed(4)}{" "}
                {balance.symbol}
              </div>
            )}
            <DropdownMenu.Separator
              style={{ height: "1px", background: "var(--border-subtle)" }}
            />
            <DropdownMenu.Item
              className={menuItemClass}
              style={{ color: "var(--text-secondary)" }}
              onClick={() => navigator.clipboard.writeText(address)}
            >
              Copy address
            </DropdownMenu.Item>
            <DropdownMenu.Separator
              style={{ height: "1px", background: "var(--border-subtle)" }}
            />
            <DropdownMenu.Item
              className={menuItemClass}
              style={{ color: "var(--danger)" }}
              onClick={() => disconnect()}
            >
              Disconnect
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  // No wallet at all. Checked before the connect branches, because a Connect button is the wrong
  // answer here: clicking it rejects with ConnectorNotFoundError, wagmi settles that into mutation
  // state, and the user sees a dead button with nothing in the console. This is what a second
  // browser without the extension actually looks like.
  if (!hasInjectedWallet(connectors.map((c) => c.id))) {
    return (
      <a
        href={WALLET_INSTALL_URL}
        target="_blank"
        rel="noreferrer"
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 text-[11px] font-medium tracking-[0.02em] uppercase no-underline"
        style={{
          borderRadius: "2px",
          border: "1px solid var(--warning)",
          color: "var(--warning)",
          background: "transparent",
        }}
        title="No wallet extension found in this browser"
      >
        Install a wallet
      </a>
    );
  }

  // Not connected. EIP-6963 discovery means each installed wallet appears as its own connector, so
  // there is no need to hand-maintain a wallet list.
  if (connectors.length === 1) {
    return (
      <Button
        size="sm"
        className="w-full"
        onClick={() => handleConnect(connectors[0])}
      >
        Connect Wallet
      </Button>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button size="sm" className="w-full">
          Connect Wallet
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="mt-1 w-52 overflow-hidden z-50"
          style={menuContentStyle}
        >
          {connectors.map((connector) => (
            <DropdownMenu.Item
              key={connector.uid}
              className={menuItemClass}
              style={{ color: "var(--text-secondary)" }}
              onClick={() => handleConnect(connector)}
            >
              {connector.icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={connector.icon}
                  alt=""
                  width={16}
                  height={16}
                  className="rounded-sm"
                />
              )}
              {connector.name}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

"use client";

import { useMemo } from "react";
import { WagmiProvider, createConfig, http, cookieStorage, createStorage } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { botChain, bohrTestnet, WAGMI_CHAINS } from "@/lib/botchain/chain";
import { app } from "@/lib/app-config";

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

/**
 * EVM wallet stack.
 *
 * Bo Wallet, BOT Chain's own wallet, cannot be reached from a web page at all: no browser
 * extension and no in-app dApp browser, confirmed with BOT Chain. There is no code that fixes
 * that, so MetaMask is the wallet for this path.
 *
 *   injected()      - MetaMask's extension on desktop, and its mobile in-app browser.
 *   walletConnect() - MetaMask on a phone paired to a desktop page over QR.
 *
 * WalletConnect is only registered when a project ID is present, so a missing env var degrades to
 * injected-only rather than throwing at module load. Drop it entirely if an app never needs the
 * QR path — that also drops three hosts from the network allowlist.
 */
function buildConfig() {
  const connectors = [
    injected({ shimDisconnect: true }),
    ...(WC_PROJECT_ID
      ? [
          walletConnect({
            projectId: WC_PROJECT_ID,
            showQrModal: true,
            metadata: {
              name: app.name,
              description: app.tagline,
              url: app.url,
              icons: [`${app.url}/icon-256.png`],
            },
          }),
        ]
      : []),
  ];

  return createConfig({
    chains: WAGMI_CHAINS,
    connectors,
    // EIP-6963 discovery, so multiple installed wallets are listed separately instead of fighting
    // over window.ethereum.
    multiInjectedProviderDiscovery: true,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    transports: {
      [botChain.id]: http(),
      [bohrTestnet.id]: http(),
    },
  });
}

export function EvmProvider({ children }: { children: React.ReactNode }) {
  const config = useMemo(buildConfig, []);
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Chain reads are cheap and these apps are not chatty. Keep data fresh enough that a
            // balance does not look stale after a transaction.
            staleTime: 10_000,
            retry: 2,
          },
        },
      }),
    [],
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

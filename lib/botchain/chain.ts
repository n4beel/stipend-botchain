import { defineChain } from "viem";

/**
 * BOT Chain network definitions.
 *
 * Both networks were confirmed live against their RPCs on 2026-10-16: mainnet answers
 * `eth_chainId` with `0x2a5` (677) and Bohr with `0x3c8` (968). Decimals are the EVM default of
 * 18, confirmed against a real mainnet balance.
 *
 * The testnet is branded "Bohr" and lives on its own domain, which reads as an unrelated project
 * until you know. It is BOT Chain's testnet.
 */

const MAINNET_RPC = process.env.NEXT_PUBLIC_BOTCHAIN_RPC ?? "https://rpc.botchain.ai";
const MAINNET_WS = process.env.NEXT_PUBLIC_BOTCHAIN_WS ?? "wss://ws-rpc.botchain.ai";
const TESTNET_RPC = process.env.NEXT_PUBLIC_BOHR_RPC ?? "https://rpc.bohr.life";

export const botChain = defineChain({
  id: 677,
  name: "BOT Chain",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: { http: [MAINNET_RPC], webSocket: [MAINNET_WS] },
  },
  blockExplorers: {
    default: { name: "BotScan", url: "https://scan.botchain.ai" },
  },
});

export const bohrTestnet = defineChain({
  id: 968,
  name: "Bohr Testnet",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: {
    default: { http: [TESTNET_RPC] },
  },
  blockExplorers: {
    default: { name: "Bohr Scan", url: "https://scan.bohr.life" },
  },
  testnet: true,
});

/**
 * Which BOT Chain network the app targets. Development runs against Bohr; the listing requirement
 * is satisfied on mainnet, so production must be 677.
 */
export const activeBotChain =
  process.env.NEXT_PUBLIC_BOTCHAIN_NETWORK === "mainnet" ? botChain : bohrTestnet;

export const BOT_CHAINS = [botChain, bohrTestnet] as const;
/**
 * The chains in the order wagmi should be handed them, the build's target first.
 *
 * This ordering is load-bearing, not cosmetic. With no wallet connected, wagmi's `useChainId`
 * reports `chains[0]`, and every read and every network label in the app keys off that. Listing
 * mainnet first meant a testnet build told an unconnected visitor "Mainnet" and pointed its
 * contract reads at 677 — on a page that was displaying a Bohr record. Active first makes the
 * unconnected default agree with what the build actually targets.
 */
export const WAGMI_CHAINS =
  activeBotChain.id === botChain.id
    ? ([botChain, bohrTestnet] as const)
    : ([bohrTestnet, botChain] as const);


export type BotChainId = (typeof BOT_CHAINS)[number]["id"];

export function isBotChainId(id: number | undefined): id is BotChainId {
  return id === botChain.id || id === bohrTestnet.id;
}

/**
 * Is this the network THIS BUILD runs on?
 *
 * Distinct from `isBotChainId`, and the distinction is load-bearing: both 677 and 968 are BOT
 * Chain, so `isBotChainId` is true for a wallet sitting on the wrong one. A mainnet build that
 * gated on `isBotChainId` let a wallet on Bohr straight through and then transacted against the
 * testnet contract, with nothing to show for it but a badge that flipped on connect.
 */
// A type guard, not a plain boolean: it stands where `isBotChainId` used to, and the code after
// it needs `chainId` narrowed to a BotChainId. Sound, because activeBotChain is one of the two.
export function isActiveChain(id: number | undefined): id is BotChainId {
  return id === activeBotChain.id;
}

/** The chain definition for a BOT Chain ID. Defaults to the testnet for anything unrecognised. */
export function botChainById(chainId: number) {
  return chainId === botChain.id ? botChain : bohrTestnet;
}

/** Explorer link for a transaction hash on whichever BOT Chain network it happened on. */
export function txUrl(chainId: number, hash: string): string {
  return `${botChainById(chainId).blockExplorers.default.url}/tx/${hash}`;
}

/** Explorer link for an address. */
export function addressUrl(chainId: number, address: string): string {
  return `${botChainById(chainId).blockExplorers.default.url}/address/${address}`;
}

/**
 * Where a user with no BOT is sent to get some.
 *
 * Mainnet has no faucet — BOT is acquired by bridge or DEX swap — so this is null on 677 and
 * callers must not promise one.
 */
export function faucetUrl(chainId: number): string | null {
  return chainId === bohrTestnet.id ? "https://faucet.botchain.ai/basic" : null;
}

export const BOTCHAIN_SITE_URL = "https://botchain.ai";
export const BOTCHAIN_EXPLORER_URL = "https://scan.botchain.ai";

import { isDeployed, getDeployment } from "./deployment";

export type FooterLinks = {
  contract: string | null;
  site: string;
  explorer: string;
};

export function footerLinks(chainId: number = activeBotChain.id): FooterLinks {
  const deployed = isBotChainId(chainId) && isDeployed(chainId);
  const contract = deployed
    ? addressUrl(chainId, getDeployment(chainId).address)
    : null;
  return {
    contract,
    site: BOTCHAIN_SITE_URL,
    explorer: BOTCHAIN_EXPLORER_URL,
  };
}


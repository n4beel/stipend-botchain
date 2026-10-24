/**
 * Whether the browser has a wallet at all.
 *
 * This is its own question, separate from "not connected", because the two need opposite answers.
 * Not connected is fixed by clicking Connect. No wallet installed cannot be, and showing a Connect
 * button to someone with no wallet produces a button that does nothing when clicked and reports
 * nothing: `connect()` rejects with `ConnectorNotFoundError`, wagmi settles that into mutation
 * state, and nothing reaches the console. A browser without an extension — a second browser the
 * user keeps for other work — looks like a broken app rather than a missing wallet.
 *
 * Detection leans on EIP-6963. wagmi always carries the generic `injected` connector whether or
 * not anything is there to inject, so its presence proves nothing; a connector with any other id
 * was discovered because a wallet announced itself. `window.ethereum` is the fallback for a wallet
 * that injects the legacy way without announcing.
 */

/** wagmi's always-present, non-discovered connector. Its existence says nothing about a wallet. */
const GENERIC_INJECTED_ID = "injected";

export function hasInjectedWallet(
  connectorIds: readonly string[],
  ethereum: unknown = typeof window === "undefined" ? undefined : (window as { ethereum?: unknown }).ethereum,
): boolean {
  if (connectorIds.some((id) => id !== GENERIC_INJECTED_ID)) return true;
  return Boolean(ethereum);
}

/**
 * Where to send someone who has no wallet.
 *
 * MetaMask's own download page detects the browser and offers the right extension, which is why
 * this is one link rather than a per-browser table that would go stale.
 */
export const WALLET_INSTALL_URL = "https://metamask.io/download/";

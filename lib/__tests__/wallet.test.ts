import { describe, expect, it } from "vitest";
import { hasInjectedWallet } from "../wallet";

/**
 * The case this exists for: a browser with no extension showed a Connect button that did nothing
 * when clicked and logged nothing, because wagmi's generic `injected` connector is present whether
 * or not a wallet is.
 */
describe("hasInjectedWallet", () => {
  it("is false when only the generic injected connector exists and nothing is injected", () => {
    expect(hasInjectedWallet(["injected"], undefined)).toBe(false);
  });

  it("is true when a wallet announced itself over EIP-6963", () => {
    expect(hasInjectedWallet(["injected", "io.metamask"], undefined)).toBe(true);
  });

  it("is true for a legacy wallet that injects without announcing", () => {
    expect(hasInjectedWallet(["injected"], {})).toBe(true);
  });

  it("is false with no connectors at all", () => {
    expect(hasInjectedWallet([], undefined)).toBe(false);
  });

  it("does not count the generic connector appearing more than once", () => {
    expect(hasInjectedWallet(["injected", "injected"], undefined)).toBe(false);
  });

  it("counts WalletConnect, which needs no extension", () => {
    expect(hasInjectedWallet(["injected", "walletConnect"], undefined)).toBe(true);
  });
});

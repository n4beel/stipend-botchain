import { describe, expect, it } from "vitest";
import { activeBotChain, botChain, bohrTestnet, WAGMI_CHAINS } from "../chain";

describe("WAGMI_CHAINS ordering", () => {
  /**
   * The bug this pins: wagmi reports `chains[0]` from `useChainId` when no wallet is connected,
   * so with mainnet listed first a testnet build labelled itself "Mainnet" and pointed its reads
   * at 677 — on a page rendering a Bohr record. Caught by curling the certificate page, not by
   * any test, which is why there is one now.
   */
  it("puts the build's target chain first", () => {
    expect(WAGMI_CHAINS[0].id).toBe(activeBotChain.id);
  });

  it("still offers both networks", () => {
    expect([...WAGMI_CHAINS].map((c) => c.id).sort()).toEqual(
      [botChain.id, bohrTestnet.id].sort(),
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  addressUrl,
  bohrTestnet,
  botChain,
  botChainById,
  BOTCHAIN_EXPLORER_URL,
  BOTCHAIN_SITE_URL,
  faucetUrl,
  footerLinks,
  isBotChainId,
  txUrl,
} from "../chain";
import { DEPLOYMENTS, ZERO_ADDRESS } from "../deployment";

describe("chain identity", () => {
  // These two numbers are the whole premise. Both were confirmed against the live RPCs on
  // 2026-10-16 (mainnet eth_chainId 0x2a5, Bohr 0x3c8); a typo here signs transactions for
  // another network.
  it("pins the chain IDs", () => {
    expect(botChain.id).toBe(677);
    expect(bohrTestnet.id).toBe(968);
  });

  it("recognises only BOT Chain networks", () => {
    expect(isBotChainId(677)).toBe(true);
    expect(isBotChainId(968)).toBe(true);
    expect(isBotChainId(1)).toBe(false);
    expect(isBotChainId(undefined)).toBe(false);
  });

  it("marks only the testnet as a testnet", () => {
    expect(botChain.testnet).toBeUndefined();
    expect(bohrTestnet.testnet).toBe(true);
  });
});

describe("explorer links", () => {
  const hash = "0xabc";

  it("points each network at its own explorer", () => {
    expect(txUrl(677, hash)).toBe("https://scan.botchain.ai/tx/0xabc");
    expect(txUrl(968, hash)).toBe("https://scan.bohr.life/tx/0xabc");
    expect(addressUrl(677, hash)).toBe("https://scan.botchain.ai/address/0xabc");
  });

  it("falls back to the testnet for an unknown chain", () => {
    expect(botChainById(1).id).toBe(bohrTestnet.id);
  });
});

describe("faucet", () => {
  it("offers one on testnet", () => {
    expect(faucetUrl(968)).toBe("https://faucet.botchain.ai/basic");
  });

  // Mainnet BOT comes from a bridge or a DEX swap. Promising a faucet that does not exist sends
  // the user to a dead end at the exact moment they need funds.
  it("offers none on mainnet", () => {
    expect(faucetUrl(677)).toBeNull();
  });
});

describe("footerLinks", () => {
  it("exposes the two fixed URLs", () => {
    expect(BOTCHAIN_SITE_URL).toBe("https://botchain.ai");
    expect(BOTCHAIN_EXPLORER_URL).toBe("https://scan.botchain.ai");
  });

  it("returns three links on 677 and 968 when deployed", () => {
    for (const chainId of [677, 968] as const) {
      const links = footerLinks(chainId);
      expect(links.site).toBe(BOTCHAIN_SITE_URL);
      expect(links.explorer).toBe(BOTCHAIN_EXPLORER_URL);
      const deployment = DEPLOYMENTS[chainId];
      if (deployment && deployment.address !== ZERO_ADDRESS) {
        expect(links.contract).toMatch(/^https:\/\/[^/]+\/address\/0x[a-fA-F0-9]{40}$/);
      } else {
        expect(links.contract).toBeNull();
      }
    }
  });

  it("handles undeployed or non-botchain chain IDs gracefully", () => {
    const undeployed = footerLinks(1);
    expect(undeployed.contract).toBeNull();
    expect(undeployed.site).toBe(BOTCHAIN_SITE_URL);
    expect(undeployed.explorer).toBe(BOTCHAIN_EXPLORER_URL);
  });
});

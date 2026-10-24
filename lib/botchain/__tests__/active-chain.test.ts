import { describe, expect, it } from "vitest";
import {
  activeBotChain, bohrTestnet, botChain, isActiveChain, isBotChainId,
} from "../chain";

/**
 * Both BOT Chain networks are BOT Chain. Only one of them is the one a given build runs on, and
 * conflating those two facts has now caused a shipped bug: the wallet gate asked `isBotChainId`,
 * which is true for a wallet sitting on Bohr, so a mainnet build accepted it and transacted
 * against the testnet contract.
 */
describe("the app's network versus a BOT Chain network", () => {
  it("recognises both networks as BOT Chain", () => {
    expect(isBotChainId(botChain.id)).toBe(true);
    expect(isBotChainId(bohrTestnet.id)).toBe(true);
  });

  it("treats exactly one of them as this build's own", () => {
    const active = [botChain.id, bohrTestnet.id].filter(isActiveChain);
    expect(active).toEqual([activeBotChain.id]);
  });

  it("rejects the other BOT Chain network, which isBotChainId would accept", () => {
    const other = activeBotChain.id === botChain.id ? bohrTestnet.id : botChain.id;
    expect(isBotChainId(other)).toBe(true);
    expect(isActiveChain(other)).toBe(false);
  });

  it("rejects an unrelated chain and nothing at all", () => {
    expect(isActiveChain(1)).toBe(false);
    expect(isActiveChain(undefined)).toBe(false);
  });

  it("keeps the two chain ids distinct", () => {
    expect(botChain.id).not.toBe(bohrTestnet.id);
  });
});

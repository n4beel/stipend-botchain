import { describe, expect, it } from "vitest";
import { isDeployed, ZERO_ADDRESS, DEPLOYMENTS } from "../deployment";
import { botChain, bohrTestnet } from "../chain";

/**
 * `isDeployed` is the one gate between a user and a transaction pointed at nothing, so the rule
 * that an address alone is not enough is covered here rather than by reading the component.
 */
describe("isDeployed", () => {
  const real = "0x1111111111111111111111111111111111111111" as const;

  function withDeployment(address: string, deployBlock: bigint) {
    const chainId = bohrTestnet.id;
    const saved = DEPLOYMENTS[chainId];
    DEPLOYMENTS[chainId] = { address: address as `0x${string}`, deployBlock };
    try {
      return isDeployed(chainId);
    } finally {
      DEPLOYMENTS[chainId] = saved;
    }
  }

  it("accepts an address with a deploy block", () => {
    expect(withDeployment(real, 100n)).toBe(true);
  });

  it("rejects the zero address", () => {
    expect(withDeployment(ZERO_ADDRESS, 100n)).toBe(false);
  });

  it("rejects an address with no deploy block", () => {
    // The failure this guards: a configured address whose start block is unknown cannot be read
    // back over logs, so the app would present as ready and then show nothing.
    expect(withDeployment(real, 0n)).toBe(false);
  });

  it("keys both networks separately", () => {
    expect(Object.keys(DEPLOYMENTS).map(Number).sort()).toEqual(
      [botChain.id, bohrTestnet.id].sort(),
    );
  });
});

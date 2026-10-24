import type { Address } from "viem";
import { botChain, bohrTestnet, type BotChainId } from "./chain";

/**
 * Where this project's contract lives, keyed by chain ID.
 *
 * Every app in this family deploys exactly one contract, so this is one address per network rather
 * than ghost-pay's three. Testnet and mainnet addresses never match, hence the map rather than a
 * single constant.
 *
 * Populate from the output of `contracts/script/Deploy.s.sol`, which prints these lines ready to
 * paste into `.env.local`.
 */

export type Deployment = {
  address: Address;
  /**
   * Block the contract was deployed at. Any log query starts here rather than at genesis, which
   * on a chain with ~0.75s blocks is the difference between reading a few thousand blocks and
   * reading twenty-seven million.
   */
  deployBlock: bigint;
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/**
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only for statically written property
 * accesses. A dynamic lookup like `process.env[name]` is not replaced and reads as undefined in
 * the browser, so both variables below are spelled out literally on purpose. Do not refactor
 * these into a loop.
 */
export const DEPLOYMENTS: Record<BotChainId, Deployment> = {
  [botChain.id]: {
    address: (process.env.NEXT_PUBLIC_CONTRACT_677 as Address) ?? ZERO_ADDRESS,
    deployBlock: BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK_677 ?? "0"),
  },
  [bohrTestnet.id]: {
    address: (process.env.NEXT_PUBLIC_CONTRACT_968 as Address) ?? ZERO_ADDRESS,
    deployBlock: BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK_968 ?? "0"),
  },
};

export function getDeployment(chainId: BotChainId): Deployment {
  return DEPLOYMENTS[chainId];
}

/**
 * True when this chain's deployment is usable. Gate the UI on this.
 *
 * The deploy block counts as much as the address. A contract whose start block is unknown cannot
 * be read back over logs, so a deployment missing it is not usable and must not present as ready.
 */
export function isDeployed(chainId: BotChainId): boolean {
  const d = DEPLOYMENTS[chainId];
  return d.address !== ZERO_ADDRESS && d.deployBlock > 0n;
}

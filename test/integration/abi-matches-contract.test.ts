import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { toFunctionSelector, toEventSelector, type Abi } from "viem";
import * as appAbis from "@/lib/botchain/abi";

/**
 * The hand-written ABI must match the compiled contract, selector for selector.
 *
 * Nothing else catches a drift between the two. The Solidity tests never see `lib/botchain/abi.ts`;
 * TypeScript believes whatever its `as const` claims; and a wrong signature surfaces in the browser
 * as an unexplained revert — on mainnet, after a user has paid for it.
 *
 * This compares **selectors**, not shapes, which is what the chain actually dispatches on. A
 * renamed argument is harmless and passes; a changed type, a dropped argument or a misspelled
 * function changes the selector and fails. It needs no node and no deployment, so unlike a
 * bespoke integration test per project it costs nothing to run everywhere.
 *
 * Custom errors are checked too: viem cannot decode a revert whose error is missing from the ABI,
 * which is the difference between telling a user why a transaction failed and telling them
 * nothing.
 */

const OUT = join(process.cwd(), "contracts", "out");

type AbiEntry = { type: string; name?: string; inputs?: readonly { type: string }[] };

/** Every compiled contract's ABI, keyed by contract name. */
function compiledAbis(): Map<string, AbiEntry[]> {
  const found = new Map<string, AbiEntry[]>();
  if (!existsSync(OUT)) return found;

  for (const dir of readdirSync(OUT)) {
    // `out/Foo.sol/Foo.json`. Skip forge-std and anything else that is not ours.
    if (!dir.endsWith(".sol")) continue;
    const full = join(OUT, dir);
    for (const file of readdirSync(full)) {
      if (!file.endsWith(".json")) continue;
      try {
        const artifact = JSON.parse(readFileSync(join(full, file), "utf8")) as { abi?: AbiEntry[] };
        if (artifact.abi) found.set(file.replace(/\.json$/, ""), artifact.abi);
      } catch {
        // A malformed artifact is forge's problem, not this test's.
      }
    }
  }
  return found;
}

/** `name(type,type)` for a function, event or error. */
function signature(entry: AbiEntry): string {
  return `${entry.name}(${(entry.inputs ?? []).map((i) => i.type).join(",")})`;
}

function selectorOf(entry: AbiEntry): string {
  const sig = signature(entry);
  return entry.type === "event" ? toEventSelector(sig) : toFunctionSelector(sig);
}

/** Every ABI this app exports, flattened. A project may export one per contract. */
function appEntries(): AbiEntry[] {
  const out: AbiEntry[] = [];
  for (const value of Object.values(appAbis)) {
    if (Array.isArray(value)) out.push(...(value as unknown as AbiEntry[]));
  }
  return out;
}

describe("the hand-written ABI against the compiled contracts", () => {
  const compiled = compiledAbis();

  it("found compiled artifacts to check against", () => {
    // Guards the whole file: with no artifacts every assertion below passes vacuously.
    expect(compiled.size, "run `cd contracts && forge build` first").toBeGreaterThan(0);
  });

  it("exports at least one ABI", () => {
    expect(appEntries().length).toBeGreaterThan(0);
  });

  it("every function, event and error exists in a compiled contract", () => {
    const known = new Map<string, string>();
    for (const [contract, abi] of compiled) {
      for (const entry of abi) {
        if (!entry.name || !["function", "event", "error"].includes(entry.type)) continue;
        known.set(`${entry.type}:${selectorOf(entry)}`, contract);
      }
    }

    const missing = appEntries()
      .filter((e) => e.name && ["function", "event", "error"].includes(e.type))
      .filter((e) => !known.has(`${e.type}:${selectorOf(e)}`))
      .map((e) => `${e.type} ${signature(e)}  (selector ${selectorOf(e)})`);

    expect(missing.join("\n")).toBe("");
  });

  it("agrees on state mutability for every function it declares", () => {
    // A `view` in the app ABI that is `nonpayable` on chain makes wagmi read where it should
    // write; `payable` vs `nonpayable` silently drops the value.
    type Fn = AbiEntry & { stateMutability?: string };
    const onChain = new Map<string, string>();
    for (const abi of compiled.values()) {
      for (const entry of abi as Fn[]) {
        if (entry.type === "function" && entry.name) {
          onChain.set(selectorOf(entry), entry.stateMutability ?? "nonpayable");
        }
      }
    }

    const wrong = (appEntries() as Fn[])
      .filter((e) => e.type === "function" && e.name)
      .filter((e) => onChain.has(selectorOf(e)))
      .filter((e) => (e.stateMutability ?? "nonpayable") !== onChain.get(selectorOf(e)))
      .map((e) => `${signature(e)}: app says ${e.stateMutability}, chain says ${onChain.get(selectorOf(e))}`);

    expect(wrong.join("\n")).toBe("");
  });
});

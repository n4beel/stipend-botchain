"use client";

import { useChainId } from "wagmi";
import type { Hex } from "viem";
import { txUrl } from "@/lib/botchain/chain";
import Spinner from "./Spinner";

/**
 * The life of one transaction, in one component.
 *
 * Every app here is built around a single transaction, so every app needs the same three states
 * and the same explorer link. Written once:
 *
 *   signing   - the wallet is open, nothing is on chain yet, and nothing can be cancelled here
 *   pending   - broadcast, waiting on a receipt. The hash is already a link; a chain with ~0.75s
 *               blocks confirms fast, but a user who closes the tab should still be able to find
 *               the transaction again.
 *   confirmed - mined, with the link kept. This is the hash that goes on the listing submission.
 *   failed    - reverted or dropped. Says plainly that nothing happened, because the alternative
 *               is a user who assumes it did.
 */
export type TxStage = "idle" | "signing" | "pending" | "confirmed" | "failed";

export default function TxStatus({
  stage,
  hash,
  confirmedLabel = "Confirmed on chain",
  failedLabel = "Transaction failed — nothing was recorded.",
}: {
  stage: TxStage;
  hash?: Hex | null;
  confirmedLabel?: string;
  failedLabel?: string;
}) {
  const chainId = useChainId();

  if (stage === "idle") return null;

  const link = hash ? (
    <a
      href={txUrl(chainId, hash)}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[11px] underline break-all"
      style={{ color: "var(--accent)" }}
    >
      {hash.slice(0, 10)}…{hash.slice(-8)}
    </a>
  ) : null;

  if (stage === "signing") {
    return <Spinner label="Confirm in your wallet" />;
  }

  if (stage === "pending") {
    return (
      <div className="flex flex-col gap-2">
        <Spinner label="Waiting for confirmation" />
        {link}
      </div>
    );
  }

  if (stage === "confirmed") {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: "var(--success)" }}
          />
          <span className="text-[12px]" style={{ color: "var(--success)" }}>
            {confirmedLabel}
          </span>
        </div>
        {link}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: "var(--danger)" }}
        />
        <span className="text-[12px]" style={{ color: "var(--danger)" }}>
          {failedLabel}
        </span>
      </div>
      {link}
    </div>
  );
}

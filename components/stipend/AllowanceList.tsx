"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { type Address, formatEther, isAddress } from "viem";
import { useAccount, useChainId, useReadContract } from "wagmi";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import GaugeVisual from "@/components/stipend/GaugeVisual";
import { stipendAbi } from "@/lib/botchain/abi";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import { shortAddress } from "@/lib/errors";
import { type StatusView, describePeriod } from "@/lib/stipend";

export default function AllowanceList() {
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const deployment = useMemo(
    () => (isBotChainId(chainId) ? getDeployment(chainId) : undefined),
    [chainId]
  );

  const [inputAddress, setInputAddress] = useState("");
  const [queriedAddress, setQueriedAddress] = useState<Address | undefined>(undefined);

  const activeAddress = useMemo(() => {
    if (queriedAddress) return queriedAddress;
    return connectedAddress;
  }, [queriedAddress, connectedAddress]);

  // Read allowancesFor(activeAddress, 0, 50)
  const {
    data: rawAllowances,
    isLoading,
    refetch,
  } = useReadContract({
    address: deployment?.address,
    abi: stipendAbi,
    functionName: "allowancesFor",
    args: activeAddress ? [activeAddress, 0n, 50n] : undefined,
    query: {
      enabled: Boolean(deployment?.address && activeAddress),
    },
  });

  const allowances: StatusView[] = useMemo(() => {
    if (!rawAllowances || !Array.isArray(rawAllowances)) return [];
    return rawAllowances as unknown as StatusView[];
  }, [rawAllowances]);

  // Group into: "My Allowances" (as beneficiary) vs "Allowances I Give" (as guardian)
  const { asBeneficiary, asGuardian } = useMemo(() => {
    const ben: StatusView[] = [];
    const guar: StatusView[] = [];

    if (!activeAddress) return { asBeneficiary: ben, asGuardian: guar };

    const viewer = activeAddress.toLowerCase();
    for (const a of allowances) {
      if (a.beneficiary.toLowerCase() === viewer) {
        ben.push(a);
      }
      if (a.guardian.toLowerCase() === viewer) {
        guar.push(a);
      }
    }

    return { asBeneficiary: ben, asGuardian: guar };
  }, [allowances, activeAddress]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputAddress.trim();
    if (isAddress(trimmed)) {
      setQueriedAddress(trimmed as Address);
    }
  };

  const handleReset = () => {
    setInputAddress("");
    setQueriedAddress(undefined);
  };

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">
      {/* Search / Lookup Header */}
      <Panel variant="slot" className="p-4 sm:p-5">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full">
            <label
              htmlFor="address-input"
              className="block text-[11px] uppercase tracking-wider font-semibold text-[#C9A8D6] mb-1.5"
            >
              Look up Stipends for Address
            </label>
            <input
              id="address-input"
              type="text"
              placeholder={connectedAddress ?? "0x…"}
              value={inputAddress}
              onChange={(e) => setInputAddress(e.target.value)}
              className="w-full bg-[#1C0A24] border border-[#62306F] rounded-xl px-3.5 py-2 text-sm font-mono text-[#F6E9FA] placeholder-[#C9A8D6]/40 focus:outline-none focus:border-[#7DF0C0]"
            />
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto pt-2 sm:pt-6 w-full sm:w-auto">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={!isAddress(inputAddress.trim())}
              className="flex-1 sm:flex-none"
            >
              Look Up
            </Button>
            {queriedAddress && (
              <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                Reset to Wallet
              </Button>
            )}
          </div>
        </form>

        {activeAddress && (
          <div className="mt-3 pt-3 border-t border-[#62306F]/50 flex items-center justify-between text-xs text-[#C9A8D6]">
            <span>
              Showing allowances for:{" "}
              <span className="font-mono text-[#F6E9FA] font-bold">
                {shortAddress(activeAddress)}
              </span>
              {activeAddress.toLowerCase() === connectedAddress?.toLowerCase() && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#62306F] text-[#7DF0C0] font-semibold">
                  Connected
                </span>
              )}
            </span>
            <button
              onClick={() => refetch()}
              className="text-[#7DF0C0] hover:underline"
            >
              Refresh
            </button>
          </div>
        )}
      </Panel>

      {!activeAddress ? (
        <Panel variant="card" className="p-10 text-center">
          <div className="w-12 h-12 rounded-full bg-[#7DF0C0]/20 text-[#7DF0C0] mx-auto flex items-center justify-center text-xl mb-3 shadow-[0_0_12px_rgba(125,240,192,0.4)]">
            💧
          </div>
          <h2 className="text-xl font-bold text-[#F6E9FA]">
            Spending Allowances that Refill
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-[#C9A8D6] max-w-md mx-auto leading-relaxed">
            Connect your wallet to review your spending pots, or enter any BOT Chain address above to explore.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/new" className="no-underline">
              <Button variant="primary" size="md">
                + Create a Stipend Pot
              </Button>
            </Link>
          </div>
        </Panel>
      ) : isLoading ? (
        <Panel variant="card" className="p-12 text-center text-sm text-[#C9A8D6]">
          Loading allowance pots from contract…
        </Panel>
      ) : allowances.length === 0 ? (
        <Panel variant="card" className="p-10 text-center">
          <p className="text-base text-[#F6E9FA]">No stipends found for this address.</p>
          <p className="text-xs text-[#C9A8D6] mt-1">
            Create a recurring spending allowance for family, team members, or yourself.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/new" className="no-underline">
              <Button variant="primary" size="md">
                + Create New Allowance
              </Button>
            </Link>
          </div>
        </Panel>
      ) : (
        <div className="flex flex-col gap-10">
          {/* Section 1: My Allowances (as Beneficiary) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#7DF0C0]">
                  My Allowances ({asBeneficiary.length})
                </h2>
                <span className="text-xs text-[#C9A8D6] hidden sm:inline">
                  — Pots you can draw from
                </span>
              </div>
            </div>

            {asBeneficiary.length === 0 ? (
              <Panel variant="slot" className="p-5 text-xs text-[#C9A8D6]">
                No allowances currently assigned to your address.
              </Panel>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                {asBeneficiary.map((a) => (
                  <MiniGaugeCard key={a.id.toString()} allowance={a} role="beneficiary" />
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Allowances I Give (as Guardian) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#F6E9FA]">
                  Allowances I Give ({asGuardian.length})
                </h2>
                <span className="text-xs text-[#C9A8D6] hidden sm:inline">
                  — Pots you funded and govern
                </span>
              </div>
              <Link href="/new" className="no-underline">
                <Button variant="secondary" size="sm">
                  + New Pot
                </Button>
              </Link>
            </div>

            {asGuardian.length === 0 ? (
              <Panel variant="slot" className="p-5 text-xs text-[#C9A8D6]">
                You haven&apos;t created any stipend allowances yet.
              </Panel>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                {asGuardian.map((a) => (
                  <MiniGaugeCard key={a.id.toString()} allowance={a} role="guardian" />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniGaugeCard({
  allowance,
  role,
}: {
  allowance: StatusView;
  role: "beneficiary" | "guardian";
}) {
  const periodDesc = describePeriod(allowance.period);
  const allowanceLeftFmt = formatEther(allowance.allowanceLeft);
  const perPeriodFmt = formatEther(allowance.perPeriod);
  const balanceFmt = formatEther(allowance.balance);

  return (
    <Link
      href={`/a/${allowance.id.toString()}`}
      className="group no-underline text-inherit"
    >
      <Panel
        variant="card"
        className="p-5 flex flex-col justify-between h-full group-hover:border-[#7DF0C0]/60 transition-all group-hover:shadow-[0_8px_24px_rgba(125,240,192,0.1)]"
      >
        <div>
          {/* Header row */}
          <div className="flex items-center justify-between text-xs mb-3">
            <span className="font-mono font-bold text-[#7DF0C0]">
              #{allowance.id.toString()}
            </span>
            <span className="text-[10px] uppercase font-bold text-[#C9A8D6]">
              {periodDesc}
            </span>
          </div>

          {/* Mini Gauge Object */}
          <div className="py-2 flex justify-center">
            <GaugeVisual
              allowanceLeft={allowance.allowanceLeft}
              perPeriod={allowance.perPeriod}
              balance={allowance.balance}
              isClosed={allowance.closed}
              size="mini"
            />
          </div>

          {/* Details */}
          <div className="mt-4 pt-3 border-t border-[#62306F]/50 text-xs flex flex-col gap-1">
            <div className="flex items-center justify-between text-[#C9A8D6]">
              <span>
                {role === "beneficiary" ? "From Guardian:" : "To Beneficiary:"}
              </span>
              <span className="font-mono text-[#F6E9FA]">
                {role === "beneficiary"
                  ? shortAddress(allowance.guardian)
                  : shortAddress(allowance.beneficiary)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[#C9A8D6]">
              <span>Pot Balance:</span>
              <span className="font-mono font-bold text-[#FFC86B]">
                {balanceFmt} BOT
              </span>
            </div>
          </div>
        </div>

        {/* Footer link line */}
        <div className="mt-4 pt-2 border-t border-[#62306F]/30 flex items-center justify-between text-[11px] text-[#7DF0C0] group-hover:underline">
          <span>{role === "beneficiary" ? "Draw Allowance →" : "Manage Pot →"}</span>
          <span>{allowance.closed ? "Closed" : "Active"}</span>
        </div>
      </Panel>
    </Link>
  );
}

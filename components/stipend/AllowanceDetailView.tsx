"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  type Address,
  type Hex,
  formatEther,
  parseEther,
  zeroAddress,
} from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import BotChainGate from "@/components/botchain/BotChainGate";
import GaugeVisual from "@/components/stipend/GaugeVisual";
import { stipendAbi } from "@/lib/botchain/abi";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import { describeError, shortAddress } from "@/lib/errors";
import {
  type DrawRecord,
  type StatusView,
  describePeriod,
  loadDraws,
  useRefillTimer,
} from "@/lib/stipend";

interface AllowanceDetailViewProps {
  id: bigint;
}

type ActionType = "draw" | "topUp" | "close";
type TxStage = "idle" | "signing" | "confirming" | "confirmed" | "error";

export default function AllowanceDetailView({ id }: AllowanceDetailViewProps) {
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const clientRef = useRef(publicClient);
  clientRef.current = publicClient;

  const deployment = useMemo(
    () => (isBotChainId(chainId) ? getDeployment(chainId) : undefined),
    [chainId]
  );

  // Read status(id)
  const {
    data: rawStatus,
    isLoading,
    refetch,
  } = useReadContract({
    address: deployment?.address,
    abi: stipendAbi,
    functionName: "status",
    args: [id],
    query: {
      enabled: Boolean(deployment?.address && id > 0n),
    },
  });

  const status = rawStatus as StatusView | undefined;

  // In-page automatic refetch right at refill boundary
  useRefillTimer(status?.nextRefillAt, () => {
    refetch();
  });

  // Recent draws list
  const [draws, setDraws] = useState<DrawRecord[]>([]);
  const [drawsLoading, setDrawsLoading] = useState(false);

  const fetchDraws = useCallback(async () => {
    if (!clientRef.current || !deployment?.address || !status) return;
    setDrawsLoading(true);
    try {
      const records = await loadDraws(
        clientRef.current,
        deployment.address,
        id,
        status.createdBlock
      );
      setDraws(records);
    } finally {
      setDrawsLoading(false);
    }
  }, [deployment?.address, id, status]);

  useEffect(() => {
    fetchDraws();
  }, [fetchDraws]);

  // Beneficiary Draw Inputs
  const [drawAmount, setDrawAmount] = useState("");
  // Guardian Top-up Inputs
  const [topUpAmount, setTopUpAmount] = useState("0.5");
  const [showTopUpForm, setShowTopUpForm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Transaction State
  const [action, setAction] = useState<ActionType | null>(null);
  const [stage, setStage] = useState<TxStage>("idle");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const settledHashRef = useRef<Hex | null>(null);

  const { writeContractAsync } = useWriteContract();

  const { isSuccess: receiptSuccess, isError: receiptError } =
    useWaitForTransactionReceipt({
      hash: txHash ?? undefined,
      query: { enabled: Boolean(txHash) },
    });

  // Handle Receipt Confirmation
  useEffect(() => {
    if (!txHash) return;
    if (settledHashRef.current === txHash) return;

    if (receiptSuccess) {
      settledHashRef.current = txHash;
      setStage("confirmed");
      refetch();
      fetchDraws();
    } else if (receiptError) {
      settledHashRef.current = txHash;
      setStage("error");
      setErrorMessage("Transaction failed on chain.");
    }
  }, [txHash, receiptSuccess, receiptError, refetch, fetchDraws]);

  // Perspective calculation
  const role = useMemo(() => {
    if (!status || !connectedAddress) return "observer";
    const c = connectedAddress.toLowerCase();
    if (c === status.beneficiary.toLowerCase()) return "beneficiary";
    if (c === status.guardian.toLowerCase()) return "guardian";
    return "observer";
  }, [status, connectedAddress]);

  // Spendable max
  const maxSpendableEther = useMemo(() => {
    if (!status) return "0";
    return formatEther(status.spendable);
  }, [status]);

  // Sync slider on load
  useEffect(() => {
    if (status && status.spendable > 0n && !drawAmount) {
      setDrawAmount(formatEther(status.spendable));
    }
  }, [status, drawAmount]);

  // Countdown string
  const [timeRemaining, setTimeRemaining] = useState("");
  useEffect(() => {
    if (!status || status.closed) {
      setTimeRemaining("");
      return;
    }
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const refillAt = Number(status.nextRefillAt);
      const diff = refillAt - now;

      if (diff <= 0) {
        setTimeRemaining("Refilling now…");
      } else {
        const d = Math.floor(diff / 86400);
        const h = Math.floor((diff % 86400) / 3600);
        const m = Math.floor((diff % 3600) / 60);
        if (d > 0) {
          setTimeRemaining(`Refills in ${d}d ${h}h`);
        } else if (h > 0) {
          setTimeRemaining(`Refills in ${h}h ${m}m`);
        } else {
          setTimeRemaining(`Refills in ${m}m`);
        }
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 30000);
    return () => clearInterval(interval);
  }, [status]);

  // Handlers
  const handleDraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deployment?.address || !status || role !== "beneficiary") return;

    try {
      setAction("draw");
      setStage("signing");
      setErrorMessage("");

      const amountWei = parseEther(drawAmount);
      const hash = await writeContractAsync({
        address: deployment.address,
        abi: stipendAbi,
        functionName: "draw",
        args: [id, amountWei],
      });

      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("error");
      setErrorMessage(describeError(err));
    }
  };

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deployment?.address || !status) return;

    try {
      setAction("topUp");
      setStage("signing");
      setErrorMessage("");

      const valWei = parseEther(topUpAmount);
      const hash = await writeContractAsync({
        address: deployment.address,
        abi: stipendAbi,
        functionName: "topUp",
        args: [id],
        value: valWei,
      });

      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("error");
      setErrorMessage(describeError(err));
    }
  };

  const handleClose = async () => {
    if (!deployment?.address || !status || role !== "guardian") return;

    try {
      setAction("close");
      setStage("signing");
      setErrorMessage("");

      const hash = await writeContractAsync({
        address: deployment.address,
        abi: stipendAbi,
        functionName: "close",
        args: [id],
      });

      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("error");
      setErrorMessage(describeError(err));
    }
  };

  const handleResetAction = () => {
    setStage("idle");
    setTxHash(null);
    setAction(null);
    setErrorMessage("");
    setShowTopUpForm(false);
    setShowCloseConfirm(false);
  };

  if (isLoading) {
    return (
      <Panel variant="card" className="p-12 text-center text-[#C9A8D6]">
        Loading stipend allowance #{id.toString()}…
      </Panel>
    );
  }

  if (!status || status.guardian === zeroAddress) {
    return (
      <Panel variant="card" className="p-12 text-center">
        <h2 className="text-xl font-bold text-[#F6E9FA]">Allowance Not Found</h2>
        <p className="mt-2 text-sm text-[#C9A8D6]">
          Stipend #{id.toString()} does not exist on BOT Chain.
        </p>
        <div className="mt-6">
          <Link href="/" className="no-underline">
            <Button variant="secondary" size="md">
              ← Back to Allowances
            </Button>
          </Link>
        </div>
      </Panel>
    );
  }

  const allowanceLeftFmt = formatEther(status.allowanceLeft);
  const perPeriodFmt = formatEther(status.perPeriod);
  const balanceFmt = formatEther(status.balance);
  const periodDesc = describePeriod(status.period);

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full">
      {/* Stage Confirmed Banner Rendered FIRST */}
      {stage === "confirmed" && (
        <Panel variant="gauge" className="p-6 text-center">
          <div className="flex items-center justify-center gap-2 text-[#7DF0C0] font-bold text-base mb-1">
            <span>✓</span>
            <span>
              {action === "draw"
                ? "Withdrawal Complete"
                : action === "topUp"
                ? "Pot Funded"
                : "Allowance Closed"}
            </span>
          </div>
          <p className="text-xs text-[#C9A8D6]">
            {action === "draw"
              ? `You drew ${drawAmount} BOT to your wallet.`
              : action === "topUp"
              ? `Added ${topUpAmount} BOT to pot #${id.toString()}.`
              : `Allowance closed. Remainder returned to guardian.`}
          </p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={handleResetAction}>
              Continue
            </Button>
          </div>
        </Panel>
      )}

      {/* Main Gauge & Actions Split */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        {/* Left: The Gauge Visual */}
        <div className="md:col-span-5 flex justify-center">
          <GaugeVisual
            allowanceLeft={status.allowanceLeft}
            perPeriod={status.perPeriod}
            balance={status.balance}
            isClosed={status.closed}
            size="full"
          />
        </div>

        {/* Right: Figures & Role Actions */}
        <div className="md:col-span-7 flex flex-col gap-5">
          <div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono font-bold text-[#7DF0C0]">
                Allowance #{status.id.toString()}
              </span>
              <span className="text-[#62306F]">|</span>
              <span className="text-[#C9A8D6]">Refills {periodDesc}</span>
              {status.closed && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#FFC86B]/15 text-[#FFC86B]">
                  Closed
                </span>
              )}
            </div>

            {/* Household copy headline (§3.4) */}
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#F6E9FA] mt-1.5 tracking-tight">
              {status.closed
                ? "This allowance has been closed."
                : role === "beneficiary"
                ? `You can spend ${allowanceLeftFmt} BOT more this period.`
                : `${shortAddress(status.beneficiary)} has used ${formatEther(
                    status.perPeriod - status.allowanceLeft
                  )} of ${perPeriodFmt} BOT.`}
            </h2>

            {/* Countdown line */}
            {!status.closed && timeRemaining && (
              <p className="text-xs text-[#7DF0C0] font-semibold mt-1">
                ⏱ {timeRemaining}
              </p>
            )}
          </div>

          {/* Details Bar */}
          <Panel variant="slot" className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-[#C9A8D6] block">Available to Draw:</span>
              <span className="font-mono font-bold text-[#F6E9FA] text-sm">
                {allowanceLeftFmt} BOT
              </span>
            </div>
            <div>
              <span className="text-[#C9A8D6] block">Total in Pot:</span>
              <span className="font-mono font-bold text-[#FFC86B] text-sm">
                {balanceFmt} BOT
              </span>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className="text-[#C9A8D6] block">Refill Cap:</span>
              <span className="font-mono text-[#F6E9FA]">
                {perPeriodFmt} BOT
              </span>
            </div>
          </Panel>

          {/* Beneficiary Action: Slider + Numeric Input (The One Transaction) */}
          {!status.closed && role === "beneficiary" && (
            <BotChainGate>
              <Panel variant="card" className="p-5">
                <form onSubmit={handleDraw} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="draw-slider"
                      className="text-xs font-bold uppercase tracking-wider text-[#7DF0C0]"
                    >
                      Draw from Allowance
                    </label>
                    <span className="text-xs text-[#C9A8D6]">
                      Max spendable:{" "}
                      <strong className="font-mono text-[#F6E9FA]">
                        {maxSpendableEther} BOT
                      </strong>
                    </span>
                  </div>

                  {/* Horizontal Slider */}
                  <input
                    id="draw-slider"
                    type="range"
                    min="0"
                    max={maxSpendableEther}
                    step="0.001"
                    value={drawAmount}
                    onChange={(e) => setDrawAmount(e.target.value)}
                    disabled={status.spendable === 0n || stage === "signing" || stage === "confirming"}
                    className="w-full h-2 bg-[#2D0D36] rounded-lg appearance-none cursor-pointer accent-[#7DF0C0]"
                  />

                  {/* Numeric Input & Submit Row */}
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="any"
                        min="0.000000000000000001"
                        max={maxSpendableEther}
                        value={drawAmount}
                        onChange={(e) => setDrawAmount(e.target.value)}
                        disabled={status.spendable === 0n || stage === "signing" || stage === "confirming"}
                        className="w-full bg-[#2D0D36] border border-[#62306F] rounded-xl px-3.5 py-2.5 text-sm font-mono text-[#F6E9FA] focus:outline-none focus:border-[#7DF0C0]"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-[#C9A8D6] font-mono">
                        BOT
                      </span>
                    </div>

                    <Button
                      type="submit"
                      variant="draw"
                      size="md"
                      disabled={
                        status.spendable === 0n ||
                        !drawAmount ||
                        parseFloat(drawAmount) <= 0 ||
                        parseFloat(drawAmount) > parseFloat(maxSpendableEther) ||
                        stage === "signing" ||
                        stage === "confirming"
                      }
                      loading={stage === "signing" || stage === "confirming"}
                      className="shrink-0"
                    >
                      Draw {drawAmount ? `${drawAmount} BOT` : "BOT"}
                    </Button>
                  </div>

                  {status.allowanceLeft === 0n && (
                    <p className="text-xs text-[#FFC86B]">
                      You&apos;ve used this period&apos;s allowance. Refills soon.
                    </p>
                  )}
                  {status.allowanceLeft > 0n && status.balance === 0n && (
                    <p className="text-xs text-[#FFC86B]">
                      The pot is empty. Ask guardian ({shortAddress(status.guardian)}) to top it up.
                    </p>
                  )}
                </form>
              </Panel>
            </BotChainGate>
          )}

          {/* Guardian Actions: Top Up & Close */}
          {!status.closed && role === "guardian" && (
            <BotChainGate>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => setShowTopUpForm(!showTopUpForm)}
                  >
                    + Top Up Pot
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="md"
                    onClick={() => setShowCloseConfirm(!showCloseConfirm)}
                  >
                    Close & Refund Balance
                  </Button>
                </div>

                {/* Top Up Drawer */}
                {showTopUpForm && (
                  <Panel variant="slot" className="p-4 mt-2">
                    <form onSubmit={handleTopUp} className="flex flex-col gap-3">
                      <span className="text-xs font-bold text-[#7DF0C0] uppercase">
                        Fund Pot #{status.id.toString()}
                      </span>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          step="any"
                          min="0.0001"
                          placeholder="Amount in BOT"
                          value={topUpAmount}
                          onChange={(e) => setTopUpAmount(e.target.value)}
                          className="flex-1 bg-[#2D0D36] border border-[#62306F] rounded-xl px-3 py-2 text-sm font-mono text-[#F6E9FA] focus:outline-none focus:border-[#7DF0C0]"
                        />
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          disabled={!topUpAmount || parseFloat(topUpAmount) <= 0 || stage === "signing" || stage === "confirming"}
                          loading={stage === "signing" || stage === "confirming"}
                        >
                          Deposit BOT
                        </Button>
                      </div>
                    </form>
                  </Panel>
                )}

                {/* Close Confirmation Dialog */}
                {showCloseConfirm && (
                  <Panel variant="slot" className="p-4 mt-2 border-[#FFC86B]/50 bg-[#FFC86B]/5">
                    <p className="text-xs text-[#F6E9FA] leading-relaxed">
                      Are you sure you want to close this allowance?{" "}
                      <strong className="text-[#FFC86B]">
                        {balanceFmt} BOT
                      </strong>{" "}
                      remaining in the pot will be returned immediately to your guardian wallet.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={handleClose}
                        disabled={stage === "signing" || stage === "confirming"}
                        loading={stage === "signing" || stage === "confirming"}
                      >
                        Confirm Close & Retrieve {balanceFmt} BOT
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCloseConfirm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </Panel>
                )}
              </div>
            </BotChainGate>
          )}

          {/* Third Party / Observer Notice */}
          {role === "observer" && !status.closed && (
            <Panel variant="slot" className="p-4 text-xs text-[#C9A8D6]">
              This allowance is governed by guardian{" "}
              <span className="font-mono text-[#F6E9FA]">
                {shortAddress(status.guardian)}
              </span>{" "}
              for beneficiary{" "}
              <span className="font-mono text-[#F6E9FA]">
                {shortAddress(status.beneficiary)}
              </span>
              . Only the beneficiary can draw funds.
            </Panel>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-[#FFC86B]/10 border border-[#FFC86B]/40 text-[#FFC86B] text-xs">
              {errorMessage}
            </div>
          )}
        </div>
      </div>

      {/* Recent Draws Event Log */}
      <Panel variant="card" className="mt-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-[#F6E9FA]">
            Recent Draws ({draws.length})
          </h3>
          <span className="text-xs text-[#C9A8D6]">
            Events logged from block #{status.createdBlock.toString()}
          </span>
        </div>

        {drawsLoading ? (
          <p className="text-xs text-[#C9A8D6] py-4 text-center">Loading event logs…</p>
        ) : draws.length === 0 ? (
          <p className="text-xs text-[#C9A8D6] py-4 text-center">
            No draws made from this allowance yet.
          </p>
        ) : (
          <div className="divide-y divide-[#62306F]/50">
            {draws.map((d, i) => (
              <div
                key={`${d.transactionHash}-${i}`}
                className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#7DF0C0]" />
                  <span className="font-mono font-bold text-[#F6E9FA]">
                    {formatEther(d.amount)} BOT
                  </span>
                  <span className="text-[#C9A8D6]">drawn</span>
                </div>

                <div className="flex items-center gap-3 text-[#C9A8D6]">
                  <span>
                    Remaining:{" "}
                    <span className="font-mono text-[#F6E9FA]">
                      {formatEther(d.allowanceLeft)} BOT
                    </span>
                  </span>
                  <span>|</span>
                  <a
                    href={`https://scan.botchain-apps.dev/tx/${d.transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#7DF0C0] hover:underline font-mono"
                  >
                    Tx {d.transactionHash.slice(0, 8)}…
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

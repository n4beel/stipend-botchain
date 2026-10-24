"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type Address,
  type Hex,
  decodeEventLog,
  isAddress,
  parseEther,
  zeroAddress,
} from "viem";
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { stipendAbi } from "@/lib/botchain/abi";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import { describeError, shortAddress } from "@/lib/errors";
import { describePeriod } from "@/lib/stipend";
import { MAX_LABEL_BYTES, MAX_PERIOD, MIN_PERIOD } from "@/lib/limits";

type TxStage = "idle" | "signing" | "confirming" | "confirmed" | "error";

type PeriodPreset = "1d" | "7d" | "14d" | "30d" | "custom";

export default function CreateAllowanceForm() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const deployment = useMemo(
    () => (isBotChainId(chainId) ? getDeployment(chainId) : undefined),
    [chainId]
  );

  // Form State
  const [beneficiary, setBeneficiary] = useState("");
  const [perPeriodInput, setPerPeriodInput] = useState("0.2");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("7d");
  const [customDays, setCustomDays] = useState("7");
  const [label, setLabel] = useState("");
  const [depositInput, setDepositInput] = useState("1.0");

  // Transaction State
  const [stage, setStage] = useState<TxStage>("idle");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const settledHashRef = useRef<Hex | null>(null);

  const { writeContractAsync } = useWriteContract();

  const { data: receipt, isSuccess: receiptSuccess, isError: receiptError } =
    useWaitForTransactionReceipt({
      hash: txHash ?? undefined,
      query: { enabled: Boolean(txHash) },
    });

  // Calculate duration in seconds
  const periodSeconds = useMemo(() => {
    switch (periodPreset) {
      case "1d":
        return 86400n;
      case "7d":
        return 604800n;
      case "14d":
        return 1209600n;
      case "30d":
        return 2592000n;
      case "custom": {
        const d = parseFloat(customDays) || 1;
        return BigInt(Math.max(3600, Math.floor(d * 86400)));
      }
      default:
        return 604800n;
    }
  }, [periodPreset, customDays]);

  // Validation
  const validation = useMemo(() => {
    const errors: string[] = [];

    if (!beneficiary.trim()) {
      errors.push("Enter a beneficiary address.");
    } else if (!isAddress(beneficiary.trim())) {
      errors.push("Invalid recipient address.");
    } else if (
      connectedAddress &&
      beneficiary.trim().toLowerCase() === connectedAddress.toLowerCase()
    ) {
      errors.push("The recipient has to be someone other than you.");
    }

    const capNum = parseFloat(perPeriodInput);
    if (isNaN(capNum) || capNum <= 0) {
      errors.push("Cap per period must be greater than zero.");
    }

    const depNum = parseFloat(depositInput);
    if (isNaN(depNum) || depNum < 0) {
      errors.push("Initial deposit cannot be negative.");
    }

    if (periodSeconds < MIN_PERIOD || periodSeconds > MAX_PERIOD) {
      errors.push("Period must be between 1 hour and 365 days.");
    }

    if (new TextEncoder().encode(label).length > Number(MAX_LABEL_BYTES)) {
      errors.push("Label must be 60 bytes or less.");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }, [beneficiary, connectedAddress, perPeriodInput, depositInput, periodSeconds, label]);

  // Handle Receipt Confirmation
  useEffect(() => {
    if (!txHash || !receipt) return;
    if (settledHashRef.current === txHash) return;

    if (receiptSuccess) {
      settledHashRef.current = txHash;
      setStage("confirmed");

      // Extract created ID from logs
      let foundId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: stipendAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "Created") {
            foundId = (decoded.args as { id: bigint }).id;
            break;
          }
        } catch {
          // not our event
        }
      }

      if (foundId) {
        setCreatedId(foundId);
      }
    } else if (receiptError) {
      settledHashRef.current = txHash;
      setStage("error");
      setErrorMessage("Transaction failed on chain.");
    }
  }, [txHash, receipt, receiptSuccess, receiptError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.isValid || !deployment?.address) return;

    try {
      setStage("signing");
      setErrorMessage("");

      const capWei = parseEther(perPeriodInput);
      const depositWei = parseEther(depositInput || "0");

      const hash = await writeContractAsync({
        address: deployment.address,
        abi: stipendAbi,
        functionName: "create",
        args: [
          beneficiary.trim() as Address,
          capWei,
          periodSeconds,
          label.trim(),
        ],
        value: depositWei,
      });

      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("error");
      setErrorMessage(describeError(err));
    }
  };

  const handleReset = () => {
    setStage("idle");
    setTxHash(null);
    setCreatedId(null);
    setErrorMessage("");
    setBeneficiary("");
    setPerPeriodInput("0.2");
    setDepositInput("1.0");
    setLabel("");
  };

  // Preview sentence
  const previewSentence = useMemo(() => {
    const short = isAddress(beneficiary.trim())
      ? shortAddress(beneficiary.trim())
      : "Beneficiary";
    const cap = perPeriodInput || "0.2";
    const periodDesc = describePeriod(periodSeconds);
    return `${short} can spend up to ${cap} BOT ${periodDesc}. You can close it whenever you like.`;
  }, [beneficiary, perPeriodInput, periodSeconds]);

  // Stage confirmed rendered FIRST per conventions
  if (stage === "confirmed") {
    return (
      <Panel variant="gauge" className="max-w-xl mx-auto p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-[#7DF0C0]/20 text-[#7DF0C0] mx-auto flex items-center justify-center text-xl font-bold mb-4 shadow-[0_0_16px_rgba(125,240,192,0.5)]">
          ✓
        </div>
        <h2 className="text-2xl font-bold text-[#F6E9FA]">
          Stipend Allowance Created
        </h2>
        {createdId && (
          <p className="mt-2 text-sm text-[#C9A8D6]">
            Allowance ID: <strong className="font-mono text-[#7DF0C0]">#{createdId.toString()}</strong>
          </p>
        )}
        <p className="mt-3 text-xs sm:text-sm text-[#F6E9FA] max-w-md mx-auto leading-relaxed">
          {previewSentence}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {createdId && (
            <Link href={`/a/${createdId.toString()}`} className="no-underline">
              <Button variant="primary" size="md">
                View Allowance Gauge →
              </Button>
            </Link>
          )}
          <Button variant="secondary" size="md" onClick={handleReset}>
            Create Another
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel variant="card" className="max-w-xl mx-auto">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold text-[#F6E9FA] tracking-tight">
            Create Refilling Allowance
          </h2>
          <p className="text-xs text-[#C9A8D6] mt-1">
            Fund a pot and set a recurring spending limit for a recipient.
          </p>
        </div>

        {/* Beneficiary Address */}
        <div>
          <label
            htmlFor="beneficiary-input"
            className="block text-xs font-semibold uppercase tracking-wider text-[#C9A8D6] mb-1.5"
          >
            Beneficiary Address
          </label>
          <input
            id="beneficiary-input"
            type="text"
            placeholder="0x…"
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
            disabled={stage === "signing" || stage === "confirming"}
            className="w-full rounded-xl bg-[#2D0D36] border border-[#62306F] px-4 py-2.5 text-sm font-mono text-[#F6E9FA] placeholder-[#C9A8D6]/40 focus:outline-none focus:border-[#7DF0C0]"
          />
        </div>

        {/* Per Period Cap */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="cap-input"
              className="block text-xs font-semibold uppercase tracking-wider text-[#C9A8D6] mb-1.5"
            >
              Cap Per Period (BOT)
            </label>
            <input
              id="cap-input"
              type="number"
              step="any"
              min="0.000000000000000001"
              placeholder="0.2"
              value={perPeriodInput}
              onChange={(e) => setPerPeriodInput(e.target.value)}
              disabled={stage === "signing" || stage === "confirming"}
              className="w-full rounded-xl bg-[#2D0D36] border border-[#62306F] px-4 py-2.5 text-sm font-mono text-[#F6E9FA] placeholder-[#C9A8D6]/40 focus:outline-none focus:border-[#7DF0C0]"
            />
          </div>

          <div>
            <label
              htmlFor="deposit-input"
              className="block text-xs font-semibold uppercase tracking-wider text-[#C9A8D6] mb-1.5"
            >
              Opening Pot Balance (BOT)
            </label>
            <input
              id="deposit-input"
              type="number"
              step="any"
              min="0"
              placeholder="1.0"
              value={depositInput}
              onChange={(e) => setDepositInput(e.target.value)}
              disabled={stage === "signing" || stage === "confirming"}
              className="w-full rounded-xl bg-[#2D0D36] border border-[#62306F] px-4 py-2.5 text-sm font-mono text-[#F6E9FA] placeholder-[#C9A8D6]/40 focus:outline-none focus:border-[#7DF0C0]"
            />
          </div>
        </div>

        {/* Period Preset Selector */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#C9A8D6] mb-1.5">
            Refill Period
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { id: "1d", label: "Daily" },
                { id: "7d", label: "Weekly" },
                { id: "14d", label: "2 Weeks" },
                { id: "30d", label: "30 Days" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodPreset(p.id)}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                  periodPreset === p.id
                    ? "bg-[#7DF0C0] text-[#1C0A24] border-[#7DF0C0]"
                    : "bg-[#2D0D36] text-[#C9A8D6] border-[#62306F] hover:text-[#F6E9FA]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Label / Description */}
        <div>
          <label
            htmlFor="label-input"
            className="block text-xs font-semibold uppercase tracking-wider text-[#C9A8D6] mb-1.5"
          >
            Description Tag (Optional, max 60 bytes)
          </label>
          <input
            id="label-input"
            type="text"
            placeholder="e.g. Travel stipend, Groceries, Team expenses"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={stage === "signing" || stage === "confirming"}
            maxLength={60}
            className="w-full rounded-xl bg-[#2D0D36] border border-[#62306F] px-4 py-2.5 text-sm text-[#F6E9FA] placeholder-[#C9A8D6]/40 focus:outline-none focus:border-[#7DF0C0]"
          />
        </div>

        {/* Plain Sentence Preview */}
        <Panel variant="slot" className="p-3.5">
          <p className="text-xs text-[#7DF0C0] font-medium leading-relaxed">
            {previewSentence}
          </p>
        </Panel>

        {/* Limits & Rules Callout */}
        <div className="text-[11px] text-[#C9A8D6] bg-[#2D0D36]/50 p-3 rounded-xl border border-[#62306F]/50">
          <span className="font-bold text-[#FFC86B]">Note:</span> You can close this
          allowance at any time and retrieve whatever remains in the pot. Unused
          allowance disappears when the period rolls over and does not accumulate.
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-[#FFC86B]/10 border border-[#FFC86B]/40 text-[#FFC86B] text-xs">
            {errorMessage}
          </div>
        )}

        {/* Action Button */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={!validation.isValid || stage === "signing" || stage === "confirming"}
          loading={stage === "signing" || stage === "confirming"}
          className="w-full mt-2"
        >
          {stage === "signing"
            ? "Confirm in Wallet…"
            : stage === "confirming"
            ? "Creating on BOT Chain…"
            : "Fund Pot & Create Allowance"}
        </Button>
      </form>
    </Panel>
  );
}

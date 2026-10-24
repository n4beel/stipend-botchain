"use client";

import { useMemo } from "react";
import { formatEther } from "viem";

export interface GaugeVisualProps {
  allowanceLeft: bigint;
  perPeriod: bigint;
  balance: bigint;
  isClosed?: boolean;
  size?: "mini" | "full";
}

/**
 * Archetype S · Gauge Visual Component.
 *
 * Implements the tall rounded "jar" gauge on desktop (260 × 380 px)
 * and an adaptive radial arc on small viewports, with mint liquid level (#7DF0C0),
 * horizontal pot balance indicator line (#FFC86B), and hairline tick marks.
 */
export default function GaugeVisual({
  allowanceLeft,
  perPeriod,
  balance,
  isClosed = false,
  size = "full",
}: GaugeVisualProps) {
  // Compute percentage for allowance fill (0 - 100%)
  const allowancePercent = useMemo(() => {
    if (isClosed || perPeriod === 0n) return 0;
    const ratio = Number(allowanceLeft) / Number(perPeriod);
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }, [allowanceLeft, perPeriod, isClosed]);

  // Compute percentage for pot balance line (relative to e.g. 2x period cap or scaled)
  const potPercent = useMemo(() => {
    if (isClosed || perPeriod === 0n) return 0;
    const potRef = Number(perPeriod) * 2;
    const ratio = Number(balance) / potRef;
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }, [balance, perPeriod, isClosed]);

  const allowanceLeftFmt = formatEther(allowanceLeft);
  const perPeriodFmt = formatEther(perPeriod);
  const balanceFmt = formatEther(balance);

  // Mini variant for homepage allowance cards
  if (size === "mini") {
    return (
      <div className="flex flex-col items-center">
        <div className="relative w-24 h-36 rounded-2xl bg-[#2D0D36]/90 border border-[#62306F] overflow-hidden shadow-inner flex flex-col justify-end">
          {/* Ticks */}
          <div className="absolute top-2 bottom-2 left-1.5 w-2 flex flex-col justify-between pointer-events-none z-10 opacity-40">
            <div className="w-full h-[1px] bg-[#C9A8D6]" />
            <div className="w-full h-[1px] bg-[#C9A8D6]" />
            <div className="w-full h-[1px] bg-[#C9A8D6]" />
            <div className="w-full h-[1px] bg-[#C9A8D6]" />
          </div>

          {/* Pot balance line */}
          {!isClosed && balance > 0n && (
            <div
              className="absolute left-0 right-0 h-[2px] bg-[#FFC86B] z-20 shadow-[0_0_6px_#FFC86B]"
              style={{ bottom: `${potPercent}%` }}
              title={`Pot balance: ${balanceFmt} BOT`}
            />
          )}

          {/* Liquid fill */}
          <div
            className={`w-full transition-all duration-600 ${
              isClosed
                ? "bg-[#62306F]/50"
                : "bg-gradient-to-t from-[#46C492] via-[#7DF0C0] to-[#99F5D0] shadow-[0_0_12px_rgba(125,240,192,0.4)]"
            }`}
            style={{ height: `${allowancePercent}%` }}
          />
        </div>

        <div className="mt-2 text-center">
          <span className="font-mono text-xs font-bold text-[#F6E9FA]">
            {allowanceLeftFmt}
          </span>
          <span className="text-[10px] text-[#C9A8D6] block">
            of {perPeriodFmt} BOT
          </span>
        </div>
      </div>
    );
  }

  // Full Gauge view
  return (
    <div className="flex flex-col items-center">
      {/* Desktop Jar (hidden on small viewports) */}
      <div className="hidden sm:block">
        <div className="gauge-jar-desktop">
          {/* Jar Mouth & Lip Rim */}
          <div className="absolute top-0 left-0 right-0 h-4 bg-[#62306F]/30 border-b border-[#62306F]/60 z-20" />

          {/* Hairline Ticks */}
          <div className="gauge-ticks">
            <div className="gauge-tick-mark major" />
            <div className="gauge-tick-mark" />
            <div className="gauge-tick-mark" />
            <div className="gauge-tick-mark major" />
            <div className="gauge-tick-mark" />
            <div className="gauge-tick-mark" />
            <div className="gauge-tick-mark major" />
          </div>

          {/* Pot Balance Marker Line */}
          {!isClosed && balance > 0n && (
            <div
              className="gauge-pot-line"
              style={{ bottom: `${potPercent}%` }}
              title={`Pot balance: ${balanceFmt} BOT`}
            />
          )}

          {/* Liquid Fill */}
          <div
            className={`gauge-liquid-fill ${isClosed ? "!bg-[#62306F]/40 !shadow-none" : ""}`}
            style={{ height: `${allowancePercent}%` }}
          />

          {/* Reflection highlight */}
          <div className="absolute top-0 bottom-0 right-3 w-3 bg-gradient-to-l from-white/10 to-transparent pointer-events-none z-20" />
        </div>
      </div>

      {/* Mobile Radial Arc (visible on mobile only) */}
      <div className="sm:hidden flex flex-col items-center">
        <div className="gauge-arc-mobile flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background Track */}
            <circle
              cx="50"
              cy="50"
              r="40"
              className="text-[#62306F]/40"
              strokeWidth="10"
              stroke="currentColor"
              fill="transparent"
            />
            {/* Pot balance track */}
            {!isClosed && (
              <circle
                cx="50"
                cy="50"
                r="40"
                className="text-[#FFC86B]/30"
                strokeWidth="10"
                strokeDasharray={`${potPercent * 2.51} 251.2`}
                stroke="currentColor"
                fill="transparent"
              />
            )}
            {/* Mint Allowance Liquid Arc */}
            <circle
              cx="50"
              cy="50"
              r="40"
              className={isClosed ? "text-[#62306F]" : "text-[#7DF0C0]"}
              strokeWidth="10"
              strokeDasharray={`${allowancePercent * 2.51} 251.2`}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="font-mono text-lg font-extrabold text-[#F6E9FA]">
              {allowancePercent}%
            </span>
            <span className="text-[10px] text-[#C9A8D6] uppercase tracking-wider">
              Allowance
            </span>
          </div>
        </div>
      </div>

      {/* Sub-gauge legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-[#C9A8D6]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#7DF0C0]" />
          <span>Period Cap</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-1 rounded-sm bg-[#FFC86B]" />
          <span>Pot: <strong className="font-mono text-[#F6E9FA]">{balanceFmt} BOT</strong></span>
        </div>
      </div>
    </div>
  );
}

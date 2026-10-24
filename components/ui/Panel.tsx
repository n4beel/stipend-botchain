"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export type PanelVariant = "gauge" | "card" | "slot";

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  children: ReactNode;
  variant?: PanelVariant;
  title?: ReactNode;
  eyebrow?: string;
  badge?: ReactNode;
  footer?: ReactNode;
}

/**
 * Archetype S · Gauge Container Panel.
 *
 * Implements plum-tinted glass surface (#4A1D58) with hairline borders (#62306F),
 * recessed slot variant for sliders and inputs, and liquid jar styling.
 */
const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  {
    children,
    variant = "card",
    title,
    eyebrow,
    badge,
    footer,
    className = "",
    style,
    ...rest
  },
  ref
) {
  let containerStyles = "bg-[#4A1D58]/85 border-[#62306F] shadow-[0_8px_24px_rgba(20,5,25,0.4)]";

  if (variant === "slot") {
    // Recessed dark well for inputs and sliders
    containerStyles = "bg-[#2D0D36]/90 border-[#62306F]/80 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]";
  } else if (variant === "gauge") {
    // Highlighted panel framing the liquid gauge
    containerStyles = "bg-[#4A1D58] border-[#7DF0C0]/35 shadow-[0_12px_36px_rgba(125,240,192,0.06)]";
  }

  return (
    <div
      ref={ref}
      className={`rounded-2xl border p-5 sm:p-6 transition-all duration-200 ${containerStyles} ${className}`}
      style={style}
      {...rest}
    >
      {(eyebrow || title || badge) && (
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[#62306F]/50">
          <div>
            {eyebrow && (
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#7DF0C0] mb-0.5">
                {eyebrow}
              </p>
            )}
            {title && (
              <h3 className="text-[16px] sm:text-[18px] font-bold text-[#F6E9FA] tracking-tight">
                {title}
              </h3>
            )}
          </div>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
      )}

      <div>{children}</div>

      {footer && (
        <div className="mt-4 pt-3 border-t border-[#62306F]/50 text-[12px] text-[#C9A8D6]">
          {footer}
        </div>
      )}
    </div>
  );
});

export default Panel;

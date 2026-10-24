"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "draw" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-[12px] min-h-[36px]",
  md: "px-5 py-2.5 text-[13px] min-h-[44px]",
  lg: "px-6 py-3.5 text-[15px] min-h-[48px]",
};

/**
 * Archetype S · Gauge Action Button.
 *
 * Mint accent (#7DF0C0) on plum background with tactile hover and active response.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled = false,
    children,
    className = "",
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;

  let variantClasses = "";
  switch (variant) {
    case "primary":
    case "draw":
      variantClasses =
        "bg-[#7DF0C0] text-[#1C0A24] font-bold shadow-[0_4px_16px_rgba(125,240,192,0.3)] hover:bg-[#92F5CB] hover:shadow-[0_6px_20px_rgba(125,240,192,0.4)] active:scale-[0.98] border border-transparent";
      break;
    case "secondary":
      variantClasses =
        "bg-[#4A1D58] text-[#F6E9FA] border border-[#62306F] hover:border-[#7DF0C0]/60 hover:text-white active:bg-[#3B1646]";
      break;
    case "ghost":
      variantClasses =
        "bg-transparent text-[#C9A8D6] hover:text-[#F6E9FA] hover:bg-[#4A1D58]/60 border border-transparent";
      break;
    case "danger":
      variantClasses =
        "bg-[#FFC86B]/10 text-[#FFC86B] border border-[#FFC86B]/40 hover:bg-[#FFC86B]/20 active:bg-[#FFC86B]/30";
      break;
  }

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium tracking-tight transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none ${sizeClasses[size]} ${variantClasses} ${className}`}
      {...rest}
    >
      {loading ? (
        <>
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});

export default Button;

import { HTMLAttributes, CSSProperties } from "react";

type BadgeVariant = "private" | "pending" | "confirmed" | "error" | "default";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const inlineStyles: Record<BadgeVariant, CSSProperties> = {
  private: { background: "#7B5EA71A", border: "1px solid #7B5EA740", color: "#A07EC8" },
  pending: { background: "#F5A6231A", border: "1px solid #F5A62340", color: "var(--warning)" },
  confirmed: { background: "#1DB9541A", border: "1px solid #1DB95440", color: "var(--success)" },
  error: { background: "#E53E3E1A", border: "1px solid #E53E3E40", color: "var(--danger)" },
  default: { background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" },
};

export default function Badge({ variant = "default", children, className = "", style, ...props }: BadgeProps) {
  return (
    <span
      className={["inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-[0.04em] uppercase", className].join(" ")}
      style={{ ...inlineStyles[variant], ...style }}
      {...props}
    >
      {children}
    </span>
  );
}

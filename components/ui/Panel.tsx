import { HTMLAttributes } from "react";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  noPadding?: boolean;
}

export default function Panel({
  elevated,
  noPadding,
  children,
  className = "",
  style,
  ...props
}: PanelProps) {
  return (
    <div
      className={["rounded-none", noPadding ? "" : "p-5", className].join(" ")}
      style={{
        background: elevated ? "var(--bg-elevated)" : "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

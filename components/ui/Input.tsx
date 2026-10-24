"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  mono?: boolean;
  suffix?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, mono, suffix, className = "", style, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            className="text-[11px] font-medium uppercase tracking-[0.04em]"
            style={{ color: "var(--text-secondary)" }}
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <input
            ref={ref}
            className={[
              "w-full px-3 py-2.5 text-sm outline-none transition-colors",
              mono ? "font-mono text-[13px]" : "",
              suffix ? "pr-12" : "",
              className,
            ].join(" ")}
            style={{
              background: "var(--bg-base)",
              border: `1px solid ${error ? "var(--danger)" : "var(--border-default)"}`,
              borderRadius: "4px",
              color: "var(--text-primary)",
              ...style,
            }}
            {...props}
          />
          {suffix && (
            <div
              className="absolute right-3 text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              {suffix}
            </div>
          )}
        </div>
        {error && (
          <p className="text-[11px]" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
export default Input;

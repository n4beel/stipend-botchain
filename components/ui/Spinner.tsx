interface SpinnerProps {
  size?: number;
  label?: string;
}

/** Indeterminate progress. `label` is announced, so say what is happening, not "Loading". */
export default function Spinner({ size = 24, label }: SpinnerProps) {
  return (
    <div className="flex items-center gap-2.5" role="status">
      <span
        className="border border-t-transparent rounded-full animate-spin flex-shrink-0"
        style={{ width: size, height: size, borderColor: "var(--accent)", borderTopColor: "transparent" }}
      />
      {label && (
        <span
          className="text-[12px] tracking-[0.04em] uppercase"
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

// Fixture for hook-deps.test.ts: the four shapes that must NOT be flagged.
import { useCallback, useEffect, useMemo } from "react";
import { useChainId, useReadContract } from "wagmi";
import { useToast } from "@/components/ui/Toast";

export function Clean() {
  const existing = useReadContract({ query: { enabled: false } });
  const refetch = existing.refetch;
  const { data } = useReadContract({ query: { enabled: false } });
  const ctx = useToast(); // stable-hook-result
  // A number has no identity to churn, so it is safe in a dependency array.
  const chainId = useChainId();
  const handler = useCallback(() => {}, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useMemo(() => data, [existing.data]);

  useEffect(() => {
    ctx.toast("info", String(chainId));
    handler();
  }, [ctx, chainId, handler]);

  return null;
}

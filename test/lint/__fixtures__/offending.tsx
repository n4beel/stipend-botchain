// Fixture for hook-deps.test.ts. Not shipped, not rendered — this is the bug as it shipped in
// SealForm, kept verbatim so the detector is tested against the real shape.
import { useEffect } from "react";
import { useReadContract } from "wagmi";

export function Offending() {
  const existing = useReadContract({});
  useEffect(() => {
    void existing.refetch();
  }, [existing]);
  return null;
}

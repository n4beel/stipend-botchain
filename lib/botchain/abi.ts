/**
 * This project's contract ABI. Rewritten per project — it and `lib/app-config.ts` are the two
 * files every one of the fifteen replaces.
 *
 * Hand-written and `as const` rather than imported from `contracts/out`. The const assertion is
 * what gives viem and wagmi their argument and return types, and a generated JSON artifact loses
 * that unless it is cast, so a mistyped argument would only surface as a revert. Keep it narrow:
 * only the functions and events the UI actually calls.
 */
export const contractAbi = [] as const;

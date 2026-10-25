import { BaseError, ContractFunctionRevertedError, formatEther, type Address } from "viem";

export interface RevertDetails {
  errorName?: string;
  args?: readonly unknown[];
}

export function shortAddress(addr?: string): string {
  if (!addr) return "0x…";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function extractRevert(err: unknown): RevertDetails | undefined {
  if (typeof err !== "object" || err === null) return undefined;

  // Direct property check (e.g. test payloads or mocked errors)
  if (
    "data" in err &&
    (err as any).data &&
    typeof (err as any).data === "object" &&
    (err as any).data.errorName
  ) {
    return {
      errorName: (err as any).data.errorName,
      args: (err as any).data.args,
    };
  }
  if ("errorName" in err && typeof (err as any).errorName === "string") {
    return {
      errorName: (err as any).errorName,
      args: (err as any).args,
    };
  }

  // Viem BaseError walk
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => {
      if (e instanceof ContractFunctionRevertedError) return true;
      if (
        typeof e === "object" &&
        e !== null &&
        "data" in e &&
        Boolean((e as { data?: { errorName?: string } }).data?.errorName)
      ) {
        return true;
      }
      return false;
    });

    if (reverted) {
      if (reverted instanceof ContractFunctionRevertedError) {
        return {
          errorName: reverted.data?.errorName,
          args: reverted.data?.args,
        };
      }
      const errorObj = reverted as any;
      if (errorObj.data?.errorName) {
        return {
          errorName: errorObj.data.errorName,
          args: errorObj.data.args,
        };
      }
    }
  }

  return undefined;
}

/**
 * Maps custom contract errors and wallet issues to clear sentences (§4.4).
 */
export function describeError(err: unknown): string {
  if (!err) return "Transaction failed.";

  // User rejection
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("user rejected") || msg.includes("user denied") || msg.includes("cancelled")) {
      return "Transaction was cancelled in wallet.";
    }
  }

  const revert = extractRevert(err);
  if (revert?.errorName) {
    const args = revert.args ?? [];
    switch (revert.errorName) {
      case "OverAllowance": {
        const avail = args[0] !== undefined ? formatEther(BigInt(args[0] as string | number | bigint)) : "0";
        return `Only ${avail} BOT is left in this period's allowance.`;
      }
      case "InsufficientBalance": {
        const bal = args[0] !== undefined ? formatEther(BigInt(args[0] as string | number | bigint)) : "0";
        return `The pot only holds ${bal} BOT right now.`;
      }
      case "NotBeneficiary": {
        const caller = args[1] as Address | undefined;
        return caller
          ? `Only ${shortAddress(caller)} can draw from this allowance.`
          : "Only the designated beneficiary can draw from this allowance.";
      }
      case "NotGuardian": {
        return "Only the guardian can close this.";
      }
      case "Closed": {
        return "This allowance has been closed.";
      }
      case "BadPeriod": {
        return "Choose a period between an hour and a year.";
      }
      case "BadParty": {
        return "The recipient has to be someone other than you.";
      }
      case "ZeroAmount": {
        return "Set an amount above zero.";
      }
      case "LabelTooLong": {
        return "Description is too long (maximum 60 bytes).";
      }
      case "AmountTooLarge": {
        return "Amount exceeds the maximum allowed value.";
      }
      case "NoSuchAllowance": {
        return "Allowance not found.";
      }
      case "TransferFailed": {
        return "Transfer failed.";
      }
      case "Reentrancy": {
        return "Reentrant call detected.";
      }
      default:
        return `Contract error: ${revert.errorName}`;
    }
  }

  if (err instanceof BaseError) {
    return err.shortMessage || err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }

  return "Transaction failed.";
}

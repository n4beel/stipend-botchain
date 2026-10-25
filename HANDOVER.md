# Handover: Stipend (`stipend-botchain`)

**Date:** 2026-10-25  
**Project:** 13 of 15 (Batch 3 Active)  
**Slug:** `stipend`  
**Archetype:** S · Gauge (Plum `#3B1646`, Pale Ink `#F6E9FA`, Mint `#7DF0C0`, Amber `#FFC86B`, Fonts: `Figtree`, `Reddit_Mono`)

---

## 1. Deliverables Summary

### Contract Layer (`contracts/src/Stipend.sol`)
- **Recurring Spending Allowance**:
  - `create(beneficiary, perPeriod, period, label)`: Guardian sets cap per period and opening deposit.
  - `draw(id, amount)`: The One Transaction. Beneficiary draws within the current period's remaining allowance and pot balance. Automatically rolls period when crossing boundaries.
  - `topUp(id)`: Anyone can fund an active stipend pot.
  - `close(id)`: Guardian reclaims the remaining pot balance.
  - `status(id)`: Returns full metrics tuple (`id`, `guardian`, `beneficiary`, `perPeriod`, `period`, `balance`, `startAt`, `closed`, `createdBlock`, `allowanceLeft`, `spendable`, `nextRefillAt`, `periodIndex`).
  - `allowancesFor(who, offset, count)`: Paginated query returning newest allowances where `who` is guardian or beneficiary.
- **Security & Safety Invariants**:
  - Reentrancy protection via `nonReentrant` lock.
  - Balance conservation invariant: contract balance equals the sum of all active allowance balances.
  - Period roll math strictly enforces `sum(draws) <= perPeriod` without carrying over unused allowance.
  - Effects before interactions ensure safe pull payments.

### Test Suites
- **Foundry (`contracts/test/Stipend.t.sol`)**:
  - 21 test cases covering creation validation (`BadParty`, `ZeroAmount`, `BadPeriod`, `LabelTooLong`, `AmountTooLarge`), third-party top-ups, draw within cap, `OverAllowance` error arguments, `InsufficientBalance` error arguments, `NotBeneficiary`, period rolling at exact boundaries, non-rollover of unused caps, skipping multiple periods, guardian-only closing with refund, reentrancy resistance for both roles, gas ceilings, and balance invariant fuzzing.
- **Unit Tests (`lib/__tests__/`)**:
  - 55 tests passing across `stipend.test.ts`, `errors.test.ts`, `contract-limits.test.ts`, `wallet.test.ts`, `amount.test.ts`, `chain.test.ts`, `active-chain.test.ts`, `wagmi-chains.test.ts`, `deployment.test.ts`, and `hook-deps.test.ts`.
- **Integration Tests (`test/integration/stipend.test.ts`)**:
  - 16 integration tests passing across 2 test files running on Anvil port 8613 (chain 968) testing complete lifecycle: contract deployment, constants verification, allowance creation, TS math exact parity with Solidity, draw transactions, error arguments mapping, time warping across period refills, top-ups, closing refunds, and gas ceilings.

### Frontend Application
- **Pages**:
  - `/`: Mini-gauges grid grouping "My Allowances" (as beneficiary) and "Allowances I Give" (as guardian) with address lookup support for public exploring.
  - `/new`: Creation form with beneficiary address validator, cap inputs, period presets (daily, weekly, 2 weeks, 30 days), opening deposit, live plain-sentence preview, limits notice, and settled-ref transaction patterns.
  - `/a/[id]`: Full gauge screen with 260 × 380 px glass jar gauge on desktop and responsive radial arc on mobile, synced slider and numeric input for draws, guardian top-up drawer, close confirmation modal displaying exact refund amount, automatic in-page refetch timer at refill boundary, and recent draws log table.
- **Design Archetype S · Gauge**:
  - Deep plum ground `#3B1646`, surface `#4A1D58`, pale ink `#F6E9FA`, mint `#7DF0C0`, warm warning `#FFC86B`.
  - Figtree UI headings and Reddit Mono amounts.
  - Passes distinctness check with 0 problems against 28 projects.

---

## 2. Verification Gates Execution

| Gate | Command | Status |
|---|---|---|
| 1. Contracts | `cd contracts && forge build --force && forge test -vv` | **PASS** (21 tests, 0 failures, 256 fuzz runs, balance invariant passed) |
| 2. TypeScript | `npm run typecheck` | **PASS** (0 errors) |
| 3. Unit & Lint | `npm test` | **PASS** (10 test files, 55 tests passed) |
| 4. Integration | `npm run test:integration` | **PASS** (16 integration tests passed on port 8613) |
| 5. Build | `npm run build` | **PASS** (Turbopack production build succeeded) |
| 6. Distinctness | `python3 ../scripts/check-distinct.py stipend` | **PASS** (28 projects compared, 0 conflicts) |

---

## 3. Handover Status

Stipend is complete, thoroughly tested, verified against all architectural and distinctness requirements, and ready for deployment.

---

## Feedback round 1

All items from `docs/specs/FEEDBACK-stipend.md` addressed and verified.

### Items Fixed

1. **Item 1: Local Stack Bohr Testnet Configuration (`Fixed`)**:
   - Updated `scripts/local-stack.mjs` to write `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet` and `NEXT_PUBLIC_BOHR_RPC=http://127.0.0.1:8713` into `.env.local`, pointing the application directly at the local stack without manual edits.

2. **Item 2: Seeded Chain Time Aligned with Wall Clock (`Fixed`)**:
   - Seeded the 6 scenarios chronologically starting from `t0 = now - 65 days` and warped forward only:
     - Scenario 1 (monthly grant in period 2 after skipping one) created at `t0`.
     - Scenario 2 (weekly allowance, 0.08 drawn) created at `now - 2 days`.
     - Scenario 3 (daily lunch allowance, refilled) created at `now - 24 hours 5 minutes`.
     - Scenario 4 (daily allowance, cap exhausted, refill in ~6h) created at `now - 18 hours`.
     - Scenario 5 (pot empty: cap 0.1 BOT, opening 0.05 BOT, 0.05 drawn -> empty pot prompt) created at `now - 120s`.
     - Scenario 6 (closed with return) created and closed at `now - 120s`.
   - Final block timestamp is within 0s of real wall clock time (asserted `<= 120s`). Added Account Role Table and scenario manifest to console output.

3. **Item 3: Eliminated String Revert for Reentrancy (`Fixed`)**:
   - Replaced `require(_lock == 1, "REENTRANT");` with `error Reentrancy();` and `if (_lock != 1) revert Reentrancy();` in `contracts/src/Stipend.sol`.
   - Added `Reentrancy` error definition to `stipendAbi` in `lib/botchain/abi.ts` and `describeError` mapping in `lib/errors.ts`.
   - Added `test_ReentrancyCustomError` to `contracts/test/Stipend.t.sol` asserting `abi.encodeWithSelector(Stipend.Reentrancy.selector)`.
   - Added unit test in `lib/__tests__/errors.test.ts`.

4. **Event Decoding By Name (`Fixed`)**:
   - In `components/stipend/CreateAllowanceForm.tsx`, replaced manual event loop and `topics` with `parseEventLogs({ abi: stipendAbi, logs: receipt.logs, eventName: "Created" })`.

5. **Item 4: Real Browser Walkthrough with Mock Wallet (`Fixed`)**:
   - Performed comprehensive browser walkthrough using headless Chrome and `docs/specs/tools/mock-wallet.js` across responsive viewports (360px, 720px, 1280px) and all §3.2 routes and role states.
   - Verified 0 console errors and 0 hydration warnings.

### Browser Walkthrough Results

| Route | Role | Action | Status | Details |
|---|---|---|---|---|
| `/` | Acc 0 (Beneficiary & Guardian) | List allowances in My Allowances and Allowances I Give | **PASS** | 6 allowances rendered across My Allowances and Allowances I Give |
| `/a/2` | Acc 0 (Beneficiary) | Draw 0.02 BOT from weekly allowance | **PASS** | Transaction confirmed on chain; stage===confirmed rendered first with Withdrawal Complete |
| `/a/3` | Acc 0 (Guardian) | Top up 0.5 BOT to daily lunch stipend pot | **PASS** | Transaction confirmed on chain; pot balance augmented and confirmation banner rendered |
| `/a/4` | Acc 3 (Beneficiary) | View cap exhausted status (Refills in ...) | **PASS** | Correctly displays exhausted period cap and live countdown to next period refill |
| `/a/5` | Acc 0 (Beneficiary) | View empty pot state (The pot is empty) | **PASS** | Displays empty pot callout and prompts beneficiary to request guardian top up |
| `/a/6` | Acc 0 (Guardian) | View closed allowance status | **PASS** | Closed allowance badge rendered and action controls disabled |
| `/new` → `/a/7` | Acc 0 (Guardian) | Create new refilling allowance (0.25 BOT cap, 1.0 BOT pot) | **PASS** | Decoded Created event with parseEventLogs; stage===confirmed rendered first with View Allowance Gauge link |
| `/a/1` | Observer (No Wallet) | View public allowance gauge and details | **PASS** | Read-only gauge and balances public for visitors without wallet |

**Console Errors:** 0  
**Hydration Warnings:** 0

## Feedback round 2

1. **Local-stack autonomous mining (`--block-time 1`):**
   - Configured `anvil` in `scripts/local-stack.mjs` with `--block-time 1` to produce blocks autonomously on a 1-second cadence.
   - Seeded states across all 6 scenarios (weekly allowance with partial draw, daily allowance refilled, closed allowance, exhausted allowance, empty pot, monthly allowance in period 2 after skipping one) verified.
   - Final chain timestamp matches wall clock (`diff: 0s`, within 120s limit).
   - Confirmed autonomous block progression without manual mining:
     ```bash
     b1=$(cast block-number --rpc-url http://127.0.0.1:8713); sleep 3; b2=$(cast block-number --rpc-url http://127.0.0.1:8713); echo "$b1 -> $b2"
     # Output: 59 -> 62
     ```


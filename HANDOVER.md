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

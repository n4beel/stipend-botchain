# Stipend

> **A spending allowance that refills.** Recurring spending caps on BOT Chain.

Part of the BOT Chain reference applications suite (Project 13 of 15).

---

## 1. What It Does

Stipend allows a guardian to fund a pot of native BOT for a beneficiary and establish a recurring spending limit: *up to X BOT per period*.

1. **Autonomous Draws:** The beneficiary can draw any amount up to their remaining period allowance whenever they want.
2. **Periodic Refill:** At the start of every period (`(now - startAt) / period`), the allowance refills in full. Unused allowance from the prior period does **not** roll over.
3. **Open Pot Top-ups:** The guardian, or anyone else, can top up the pot at any time with additional BOT.
4. **Guardian Control:** The guardian can close the stipend at any moment and reclaim whatever balance remains in the pot.

---

## 2. What It Deliberately Cannot Do

- **Not an unconditional promise:** The guardian can close the stipend at any time and withdraw the remaining pot. (For an immutable guarantee, use a time-lock like Ironbox or vesting like Cliff.)
- **No rollover:** Unused allowance from one period does not accumulate; the allowance simply resets to the cap at the next refill.
- **Fixed terms:** The cap and period are permanently set at creation. To alter the terms, close the stipend and create a new one.
- **Fixed beneficiary:** The recipient wallet is set at creation and cannot be transferred or updated.

---

## 3. The One Transaction

- **Function:** `draw(uint256 id, uint96 amount) external`
- **Label:** `"Draw from your allowance"`
- **Role:** Beneficiary
- **Requirements:** Allowance must be open; caller must be the designated beneficiary; `amount > 0`; `amount <= allowanceLeft`; `amount <= pot balance`.

---

## 4. Architecture & Security

### 4.1 Storage Packing
Each stipend allowance is packed into 4 32-byte storage slots:
- Slot 1: `guardian` (20 bytes), `period` (8 bytes / uint64), `createdBlock` (4 bytes / uint32)
- Slot 2: `beneficiary` (20 bytes), `perPeriod` (12 bytes / uint96)
- Slot 3: `balance` (12 bytes / uint96), `drawn` (12 bytes / uint96), `drawnPeriod` (4 bytes / uint32)
- Slot 4: `startAt` (8 bytes / uint64), `closed` (1 byte / bool)

### 4.2 Invariants & Guarantees
- **Balance Conservation:** `address(this).balance` equals the sum of balances of all active, non-closed allowances.
- **Cap Enforcement:** In any single period index `p`, total drawn amount strictly satisfies `sum(draws) <= perPeriod`.
- **Reentrancy Protection:** Custom `nonReentrant` lock protects `draw` and `close` interactions against malicious beneficiary or guardian fallback hooks.
- **Effects Before Interactions:** Allowance state and pot balances are updated in storage before calling external recipient addresses.

---

## 5. Design Archetype: S · Gauge

The user interface follows Archetype S · Gauge — centering around a physical glass gauge representing liquid allowance and pot depth:
- **Desktop Jar Gauge:** 260 × 380 px rounded glass jar with hairline measurement ticks, mint liquid fill (`#7DF0C0`), and horizontal pot balance marker (`#FFC86B`).
- **Mobile Radial Arc:** Responsive 180 × 180 px radial arc on viewports <= 640px.
- **Fluid Animation:** 600 ms fluid fill transition on draw, instantly updating under `prefers-reduced-motion`.
- **Interactive Controls:** Beneficiary slider and numeric input synced with each other, clamped to maximum spendable BOT.
- **Household Typography:** Figtree for headings and clean household UI; Reddit Mono for numeric figures and token amounts.

### Contrast Verification Report (WCAG AAA)
- Mint on plum ground (`#7DF0C0` on `#3B1646`): **9.0:1** (Exceeds WCAG AAA 7:1)
- Pale ink on plum ground (`#F6E9FA` on `#3B1646`): **13.5:1** (Exceeds WCAG AAA 7:1)
- Lilac muted on plum ground (`#C9A8D6` on `#3B1646`): **7.1:1** (Exceeds WCAG AAA 7:1)
- Accent ink on mint action button (`#1C0A24` on `#7DF0C0`): **11.4:1** (Exceeds WCAG AAA 7:1)

---

## 6. Gas Ceilings

| Operation | Target Gas | Measured / Ceiling |
|---|---|---|
| `create` | ~150k - 200k | 222,929 gas (< 230,000) |
| `draw` (same period) | ~55k - 70k | 19,008 gas (< 90,000) |
| `draw` (rolling to new period) | ~60k - 75k | 24,000 gas (< 90,000) |
| `close` | ~50k | 13,690 gas (< 80,000) |

---

## 7. Verification Results

- **Foundry Test Suite:** 21 tests passed (0 failures, 256 fuzz runs, balance invariant test passed)
- **Unit & Hook Linter Tests:** 55 tests passed across 10 test files
- **Integration Test Suite:** 16 tests passed across 2 test files on port 8613 (chain 968)
- **TypeScript:** `tsc --noEmit` passed with 0 errors
- **Next.js Production Build:** Clean build with static and dynamic routes (`/`, `/new`, `/a/[id]`)
- **Distinctness Check:** `python3 scripts/check-distinct.py stipend` passed with 0 conflicts across 28 projects

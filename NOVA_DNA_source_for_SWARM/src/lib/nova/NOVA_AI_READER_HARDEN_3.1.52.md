# NOVA AI + Reader harden — tip 3.1.52

**Date:** 2026-07-19  
**Baseline live:** 3.1.50  
**Coords:** parallel reports worker owns 3.1.51 WIP — this tip is **3.1.52** (AI + Reader only).

## Bugs fixed (P0/P1)

1. **Howto steals live ERP asks (P0)** — `howto_guide` claimed `payment requests pending`, `did Madhu punch in today`, `punch in times` via bare keyword/pattern matches after 3.1.48.  
   - Added `isNovaLiveErpDataAsk` / `hasNovaInstructionalFraming` (EN + Hinglish `kaise`).  
   - Aware / match / write-guards skip live pulls; narrowed punch/payment/advances catalog patterns.

2. **Payment-request STAFF scope soft-fail (P1)** — missing `paymentRequest.aggregate` mock hid `scope: "self"`; skill threw and returned empty facts. Mock + aggregate coverage restored.

3. **Reports soft-fail → ₹0 (P1)** — `reports_snapshot` no longer maps AR/AP lookup failures to ₹0 when summary is also missing; returns `ok:false` with clear error.

4. **Reader OCR coerce (P1)** — currency strip no longer eats decimals (`₹1,87,575.00` → 187575); English month dates (`19 Jul 2026`) normalize.

5. **Think on low-confidence residual** — Think also runs when plan has no ready tools and confidence ≠ high (howto/paraphrase residual).

## Guides extended
- Hindi/Hinglish how-to framing; leave-request + purchase-bills guides.

## Deferred
- Multi-turn “recheck” merge edge cases beyond tip 3.1.37 locks.  
- Broader finance `.catch(() => 0)` sweep (B3) beyond reports_snapshot.  
- Entity resolve party-vs-person tenant collisions (QI residual).  
- Unhandled GSTR1 mock noise in `nova.test.ts` (test hygiene).

## Verify
- `nova.test.ts` 358 pass; help-guides + QI harness green; `test:nova-reader` 53 pass.

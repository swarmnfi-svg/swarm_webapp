# Phase G — Prediction (labeled only)

**Skill:** `collection_delay_estimate`  
**Builder:** `buildNovaPredictionFinding` (fact path still forbids `confidence: "prediction"`).

## Rules

1. Always labeled `confidence: "prediction"` + `estimateLabel` + `features[]`.
2. Never ledger truth / cash guarantee / invented ₹ totals from the model.
3. Honest empty when no overdue facts or finance permission denied.
4. `buildNovaFinding` remains fact / supported_inference only.

## Tests

`npx vitest run src/lib/nova/skills/finance/collection-delay-estimate.test.ts src/lib/nova/recipes/recipes.test.ts`

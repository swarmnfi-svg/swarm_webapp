/**
 * Recipe contract — registered, read-only, capped, intersection RBAC.
 */
import type { SessionUser } from "@/auth";
import { novaCanRunTool } from "@/lib/ai/nova-suggest";

export type NovaRecipe = {
  id: string;
  label: string;
  description: string;
  /** Candidate tool ids — runtime intersects with novaCanRunTool */
  toolIds: readonly string[];
  readOnly: true;
  maximumSteps: number;
  /** Example user phrases */
  examples: string[];
};

export function filterRecipeToolsForUser(
  user: SessionUser,
  recipe: NovaRecipe
): string[] {
  const capped = recipe.toolIds.slice(0, Math.max(1, recipe.maximumSteps));
  return capped.filter((t) => novaCanRunTool(user, t));
}

export function assertRecipeContract(recipe: NovaRecipe): string[] {
  const errors: string[] = [];
  if (!recipe.id) errors.push("id required");
  if (recipe.readOnly !== true) errors.push("readOnly must be true");
  if (!recipe.toolIds?.length) errors.push("toolIds required");
  if (recipe.maximumSteps < 1) errors.push("maximumSteps >= 1");
  if (/risk|forecast|health/i.test(recipe.id) && recipe.id !== "project_health") {
    // project_health reserved for later; collection_attention must not say risk
    if (/risk|forecast/i.test(recipe.id)) {
      errors.push("recipe id must not claim risk/forecast until scored");
    }
  }
  return errors;
}

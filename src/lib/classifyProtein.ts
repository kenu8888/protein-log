import { classifyProteinText } from "./gemini";
import { detectExcludedReason } from "./proteinFilter";
import type { ProteinResult } from "./proteinSchema";

export async function classifyProtein(inputText: string): Promise<ProteinResult> {
  const excludedReason = detectExcludedReason(inputText);

  if (excludedReason) {
    return {
      is_protein_powder: false,
      excluded_reason: excludedReason,
      manufacturer: null,
      product_name: null,
      flavor: null,
      price_jpy: null,
      protein_type: null,
      confidence: 1,
    };
  }

  return classifyProteinText(inputText);
}
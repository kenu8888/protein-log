import { z } from "zod";

export const ProteinResultSchema = z.object({
  is_protein_powder: z.boolean(),
  excluded_reason: z
    .enum([
      "protein_bar",
      "eaa",
      "bcaa",
      "other_supplement",
      "not_protein_related",
      "unknown",
    ])
    .nullable(),
  manufacturer: z.string().nullable(),
  product_name: z.string().nullable(),
  flavor: z.string().nullable(),
  price_jpy: z.number().nullable(),
  protein_grams_per_serving: z.number().nullable(),
  calories: z.number().nullable(),
  carbs: z.number().nullable(),
  fat: z.number().nullable(),
  avg_rating: z.number().nullable(),
  price_per_kg: z.number().nullable(),
  flavor_category: z
    .enum([
      "choco",
      "coffee",
      "fruit",
      "milk",
      "sweets",
      "meal",
      "plain",
      "yogurt",
      "matcha",
      "other",
    ])
    .nullable(),
  display_manufacturer: z.string().nullable(),
  display_product_name: z.string().nullable(),
  display_flavor: z.string().nullable(),
  protein_type: z
    .enum(["whey", "casein", "soy", "pea", "egg", "mixed", "unknown"])
    .nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

export type ProteinResult = z.infer<typeof ProteinResultSchema>;
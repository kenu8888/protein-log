import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProteinResult } from "./proteinSchema";

function getClient(): SupabaseClient {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)"
    );
  }
  return createClient(supabaseUrl, supabaseKey);
}

export type SourceTextRow = {
  id: string;
  source_name: string | null;
  source_url: string | null;
  raw_text: string;
  status: string;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
};

export async function fetchPendingSourceTexts(
  limit = 50
): Promise<SourceTextRow[]> {
  const client = getClient();
  const { data, error } = await client
    .from("protein_source_texts")
    .select("id, source_name, source_url, raw_text, status, error_message, processed_at, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`fetchPendingSourceTexts: ${error.message}`);
  return (data ?? []) as SourceTextRow[];
}

export type StatusUpdate = "processed" | "excluded" | "error";

export async function updateSourceStatus(
  sourceTextId: string,
  status: StatusUpdate,
  errorMessage?: string | null
): Promise<void> {
  const client = getClient();
  const { error } = await client
    .from("protein_source_texts")
    .update({
      status,
      error_message: errorMessage ?? null,
      processed_at: status === "error" ? null : new Date().toISOString(),
    })
    .eq("id", sourceTextId);

  if (error) throw new Error(`updateSourceStatus: ${error.message}`);
}

export async function saveClassificationResult(
  sourceTextId: string,
  result: ProteinResult
): Promise<void> {
  const client = getClient();

  // URL や由来情報は protein_source_texts / scraped_products から取得する
  const { data: sourceRow, error: sourceError } = await client
    .from("protein_source_texts")
    .select("source_url, source_name, source_key")
    .eq("id", sourceTextId)
    .maybeSingle();

  if (sourceError) {
    throw new Error(
      `saveClassificationResult: failed to fetch source row: ${sourceError.message}`
    );
  }

  let productImageUrl: string | null = null;
  let scrapedPriceValue: number | null = null;
  let scrapedPricePerKg: number | null = null;
  let isInStock: boolean | null = null;
  let scrapedCalories: number | null = null;
  let scrapedProteinG: number | null = null;
  let scrapedCarbs: number | null = null;
  let scrapedFat: number | null = null;

  // Amazon 由来: scraped_products を優先（価格・画像・在庫・栄養は取得元で補完）
  if (
    sourceRow?.source_name === "amazon" &&
    typeof sourceRow.source_key === "string" &&
    sourceRow.source_key.startsWith("amazon:")
  ) {
    const asin = (sourceRow.source_key as string).split(":")[1];
    if (asin) {
      const { data: sp, error: spError } = await client
        .from("scraped_products")
        .select(
          "image_url, price_value, net_weight_kg, price_per_kg, is_available, calories, protein_g, carbs_g, fat_g"
        )
        .eq("asin", asin)
        .maybeSingle();
      if (spError) {
        console.error(
          `saveClassificationResult: failed to fetch scraped_products row for asin=${asin}:`,
          spError
        );
      } else if (sp) {
        if (sp.image_url) {
          productImageUrl = sp.image_url as string;
        }
        if (typeof sp.price_value === "number") {
          scrapedPriceValue = sp.price_value as number;
        }
        if (typeof sp.price_per_kg === "number") {
          scrapedPricePerKg = sp.price_per_kg as number;
        }
        if (typeof sp.is_available === "boolean") {
          isInStock = sp.is_available as boolean;
        }
        if (typeof (sp as any).calories === "number") {
          scrapedCalories = (sp as any).calories as number;
        }
        if (typeof (sp as any).protein_g === "number") {
          scrapedProteinG = (sp as any).protein_g as number;
        }
        if (typeof (sp as any).carbs_g === "number") {
          scrapedCarbs = (sp as any).carbs_g as number;
        }
        if (typeof (sp as any).fat_g === "number") {
          scrapedFat = (sp as any).fat_g as number;
        }
      }
    }
  }

  // メーカーサイト由来: manufacturer_products から数値価格・画像を補完
  if (
    sourceRow?.source_name?.startsWith("manufacturer") &&
    typeof sourceRow.source_key === "string"
  ) {
    // 互換性のため:
    // - "manufacturer:UPsertKey" 形式なら ":" 以降
    // - それ以外は source_key 全体を upsert_key とみなす
    const rawKey = sourceRow.source_key as string;
    const upsertKey = rawKey.includes(":")
      ? rawKey.split(":").slice(1).join(":")
      : rawKey;

    if (upsertKey) {
      const { data: mp, error: mpError } = await client
        .from("manufacturer_products")
        .select("price_yen, price_per_kg, image_url")
        .eq("upsert_key", upsertKey)
        .maybeSingle();

      if (mpError) {
        console.error(
          `saveClassificationResult: failed to fetch manufacturer_products row for upsert_key=${upsertKey}:`,
          mpError
        );
      } else if (mp) {
        if (typeof mp.price_yen === "number") {
          scrapedPriceValue = scrapedPriceValue ?? (mp.price_yen as number);
        }
        if (typeof mp.price_per_kg === "number") {
          scrapedPricePerKg = scrapedPricePerKg ?? (mp.price_per_kg as number);
        }
        if (mp.image_url && !productImageUrl) {
          productImageUrl = mp.image_url as string;
        }
      }
    }
  }

  // 楽天由来: rakuten_products から価格・画像を補完
  if (
    sourceRow?.source_name === "rakuten" &&
    typeof sourceRow.source_key === "string" &&
    sourceRow.source_key.startsWith("rakuten:")
  ) {
    const itemCode = sourceRow.source_key.split(":")[1];
    if (itemCode) {
      const { data: rp, error: rpError } = await client
        .from("rakuten_products")
        .select("price_value, image_url")
        .eq("item_code", itemCode)
        .maybeSingle();
      if (rpError) {
        console.error(
          `saveClassificationResult: failed to fetch rakuten_products for item_code=${itemCode}:`,
          rpError
        );
      } else if (rp) {
        if (typeof rp.price_value === "number") {
          scrapedPriceValue = scrapedPriceValue ?? (rp.price_value as number);
        }
        if (rp.image_url && !productImageUrl) {
          productImageUrl = rp.image_url as string;
        }
      }
    }
  }

  const row = {
    source_text_id: sourceTextId,
    is_protein_powder: result.is_protein_powder,
    excluded_reason: result.excluded_reason,
    manufacturer: result.manufacturer,
    product_name: result.product_name,
    flavor: result.flavor,
    // Amazon の場合は scraped_products の数値価格を最優先で使う
    price_jpy:
      scrapedPriceValue != null ? scrapedPriceValue : result.price_jpy,
    protein_grams_per_serving:
      scrapedProteinG ?? result.protein_grams_per_serving,
    calories: scrapedCalories ?? result.calories,
    carbs: scrapedCarbs ?? result.carbs,
    fat: scrapedFat ?? result.fat,
    avg_rating: result.avg_rating,
    // 優先度: Amazon/メーカー由来の price_per_kg > LLM の推測値
    price_per_kg: scrapedPricePerKg ?? result.price_per_kg,
    price_per_20g_protein: result.price_per_20g_protein ?? null,
    flavor_category: result.flavor_category,
    display_manufacturer: result.display_manufacturer,
    display_product_name: result.display_product_name,
    display_flavor: result.display_flavor,
    protein_type: result.protein_type,
    confidence: result.confidence,
    product_url: sourceRow?.source_url ?? null,
    product_image_url: productImageUrl,
    is_in_stock: isInStock,
  };

  const { error } = await client
    .from("product_classification_results")
    .upsert(row, { onConflict: "source_text_id" });

  if (error) throw new Error(`saveClassificationResult: ${error.message}`);
}

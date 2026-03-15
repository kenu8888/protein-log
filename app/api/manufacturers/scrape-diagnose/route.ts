import { NextResponse } from "next/server"
import { supabase } from "../../../../lib/supabase"

/**
 * メーカー取得データが画面に出ないときの切り分け用。
 * GET で呼ぶと、manufacturer_products / protein_source_texts / product_classification_results の
 * 件数とサンプルを返す。
 * ?product=マッスルストロベリー のように指定すると、該当商品の mp / pcr を照合用に返す（価格・容量が入らない原因調査用）。
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const productFilter = searchParams.get("product")?.trim() || null
  const out: Record<string, unknown> = {}

  try {
    const { data: mpRows, error: mpErr } = await supabase
      .from("manufacturer_products")
      .select("manufacturer_name, product_name, price_yen, price_per_kg, calories, protein_g, upsert_key, updated_at")
      .order("updated_at", { ascending: false })
      .limit(30)

    if (mpErr) {
      out.manufacturer_products_error = mpErr.message
    } else {
      const withPrice = (mpRows ?? []).filter((r: any) => r.price_yen != null).length
      const withNutrition = (mpRows ?? []).filter((r: any) => r.calories != null || r.protein_g != null).length
      out.manufacturer_products = {
        total_sampled: (mpRows ?? []).length,
        with_price_yen: withPrice,
        with_nutrition: withNutrition,
        sample: (mpRows ?? []).slice(0, 3).map((r: any) => ({
          manufacturer_name: r.manufacturer_name,
          product_name: r.product_name,
          price_yen: r.price_yen,
          calories: r.calories,
          protein_g: r.protein_g,
          upsert_key: r.upsert_key
        }))
      }
    }

    const { data: pstRows, error: pstErr } = await supabase
      .from("protein_source_texts")
      .select("source_key, status, created_at")
      .eq("source_name", "manufacturer")
      .order("created_at", { ascending: false })
      .limit(200)

    if (pstErr) {
      out.protein_source_texts_error = pstErr.message
    } else {
      const statusCounts = (pstRows ?? []).reduce((acc: Record<string, number>, r: any) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1
        return acc
      }, {})
      out.protein_source_texts = {
        total_sampled: (pstRows ?? []).length,
        by_status: statusCounts,
        sample_keys: (pstRows ?? []).slice(0, 3).map((r: any) => r.source_key)
      }
    }

    const { data: pcrRows, error: pcrErr } = await supabase
      .from("product_classification_results")
      .select("manufacturer, display_manufacturer, display_product_name, display_flavor, price_jpy, price_per_kg, unit_text, protein_grams_per_serving, is_protein_powder, product_url, source_text_id")
      .order("created_at", { ascending: false })
      .limit(productFilter ? 20 : 50)

    if (pcrErr) {
      out.product_classification_results_error = pcrErr.message
    } else {
      let filteredPcr = (pcrRows ?? []) as any[]
      if (productFilter) {
        filteredPcr = filteredPcr.filter(
          (r) =>
            (r.display_product_name && String(r.display_product_name).includes(productFilter)) ||
            (r.display_flavor && String(r.display_flavor).includes(productFilter))
        )
      }
      const asProtein = (pcrRows ?? []).filter((r: any) => r.is_protein_powder === true).length
      const withPrice = (pcrRows ?? []).filter((r: any) => r.price_jpy != null).length
      out.product_classification_results = {
        total_sampled: (pcrRows ?? []).length,
        is_protein_powder_true: asProtein,
        with_price_jpy: withPrice,
        sample: (productFilter ? filteredPcr : (pcrRows ?? []).slice(0, 5)).slice(0, 10).map((r: any) => ({
          manufacturer: r.manufacturer,
          display_product_name: r.display_product_name,
          display_flavor: r.display_flavor,
          price_jpy: r.price_jpy,
          price_per_kg: r.price_per_kg,
          unit_text: r.unit_text,
          source_text_id: r.source_text_id,
          is_protein_powder: r.is_protein_powder
        }))
      }
    }

    if (productFilter) {
      const { data: mpMatch } = await supabase
        .from("manufacturer_products")
        .select("manufacturer_name, product_name, flavor, unit_text, price_yen, price_per_kg, upsert_key, source_url")
        .ilike("product_name", `%${productFilter}%`)
      const { data: pstByPcr } = await supabase
        .from("protein_source_texts")
        .select("id, source_key, source_name")
        .in("id", (pcrRows ?? []).map((r: any) => r.source_text_id).filter(Boolean))
      const keyMap = new Map((pstByPcr ?? []).map((r: any) => [r.id, r.source_key]))
      out.product_investigation = {
        note: "同一商品が複数出る・価格が空の原因調査用。pcr.source_text_id に対応する source_key が manufacturer_products.upsert_key と一致（manufacturer: プレフィックス付き）なら価格補完される。",
        manufacturer_products_matching: (mpMatch ?? []).map((r: any) => ({
          manufacturer_name: r.manufacturer_name,
          product_name: r.product_name,
          flavor: r.flavor,
          unit_text: r.unit_text,
          price_yen: r.price_yen,
          price_per_kg: r.price_per_kg,
          upsert_key: r.upsert_key,
          source_url: r.source_url
        })),
        classification_results_matching: (pcrRows ?? []).filter(
          (r: any) =>
            (r.display_product_name && String(r.display_product_name).includes(productFilter)) ||
            (r.display_flavor && String(r.display_flavor).includes(productFilter))
        ).map((r: any) => ({
          display_manufacturer: r.display_manufacturer,
          display_product_name: r.display_product_name,
          display_flavor: r.display_flavor,
          price_jpy: r.price_jpy,
          price_per_kg: r.price_per_kg,
          unit_text: r.unit_text,
          source_text_id: r.source_text_id,
          source_key_from_texts: r.source_text_id ? keyMap.get(r.source_text_id) ?? null : null,
          expected_mp_key: r.source_text_id && keyMap.get(r.source_text_id)
            ? String(keyMap.get(r.source_text_id)).replace(/^manufacturer:/, "")
            : null
        }))
      }
    }

    return NextResponse.json({
      message: "メーカー取得〜表示までの切り分け用です。各段階の件数・サンプルを確認してください。",
      ...out
    })
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    )
  }
}

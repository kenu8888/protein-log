import { NextResponse } from "next/server"
import { supabase } from "../../../../lib/supabase"

type ImportTarget = "amazon" | "manufacturer"

type ImportRequestBody = {
  targets?: ImportTarget[]
  limit?: number
}

function buildRawTextFromAmazon(row: {
  asin: string | null
  title: string | null
  brand: string | null
  price: string | null
  rating: number | null
  source_url: string | null
}) {
  return [
    "【Amazon】",
    row.brand ? `ブランド: ${row.brand}` : null,
    row.title ? `商品名: ${row.title}` : null,
    row.price ? `価格: ${row.price}` : null,
    row.rating != null ? `評価: ${row.rating}` : null,
    row.asin ? `ASIN: ${row.asin}` : null,
    row.source_url ? `URL: ${row.source_url}` : null
  ]
    .filter(Boolean)
    .join("\n")
}

function buildRawTextFromManufacturer(row: {
  upsert_key: string | null
  manufacturer_name: string | null
  product_name: string | null
  flavor: string | null
  unit_text: string | null
  price_text: string | null
  price_yen: number | null
  price_per_kg: number | null
  source_url: string | null
}) {
  return [
    "【メーカーサイト】",
    row.manufacturer_name ? `メーカー: ${row.manufacturer_name}` : null,
    row.product_name ? `商品名: ${row.product_name}` : null,
    row.flavor ? `フレーバー: ${row.flavor}` : null,
    row.unit_text ? `容量: ${row.unit_text}` : null,
    row.price_text ? `価格: ${row.price_text}` : null,
    row.price_yen != null ? `価格(円): ${row.price_yen}` : null,
    row.price_per_kg != null ? `1kgあたり: ${row.price_per_kg}` : null,
    row.source_url ? `URL: ${row.source_url}` : null
  ]
    .filter(Boolean)
    .join("\n")
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as ImportRequestBody
  const targets: ImportTarget[] =
    body.targets && body.targets.length > 0
      ? body.targets
      : ["amazon", "manufacturer"]
  const limit = Math.min(Math.max(body.limit ?? 200, 1), 2000)

  const inserted: Record<ImportTarget, number> = {
    amazon: 0,
    manufacturer: 0
  }

  // NOTE: source_key に UNIQUE 制約がある前提（protein_source_texts_source_key_key）
  // upsert で重複投入を防ぎ、pending を更新（再実行でも壊れない）する。

  if (targets.includes("amazon")) {
    const { data, error } = await supabase
      .from("scraped_products")
      .select("asin, title, brand, price, rating, source_url")
      .order("updated_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error(error)
      return NextResponse.json(
        { error: "scraped_products の取得に失敗しました。", details: error.message },
        { status: 500 }
      )
    }

    const rows =
      (data ?? [])
        .map((r) => {
          const asin = (r as any).asin as string | null
          if (!asin) return null
          const sourceKey = `amazon:${asin}`
          return {
            source_name: "amazon",
            source_url: (r as any).source_url ?? null,
            source_key: sourceKey,
            raw_text: buildRawTextFromAmazon({
              asin,
              title: (r as any).title ?? null,
              brand: (r as any).brand ?? null,
              price: (r as any).price ?? null,
              rating: (r as any).rating ?? null,
              source_url: (r as any).source_url ?? null
            }),
            status: "pending"
          }
        })
        .filter(Boolean) as any[]

    const { error: upsertError } = await supabase
      .from("protein_source_texts")
      .upsert(rows, { onConflict: "source_key" })

    if (upsertError) {
      console.error(upsertError)
      return NextResponse.json(
        {
          error: "protein_source_texts への取り込みに失敗しました（amazon）。",
          details: upsertError.message
        },
        { status: 500 }
      )
    }
    inserted.amazon = rows.length
  }

  if (targets.includes("manufacturer")) {
    const { data, error } = await supabase
      .from("manufacturer_products")
      .select(
        "upsert_key, manufacturer_name, product_name, flavor, unit_text, price_text, price_yen, price_per_kg, source_url"
      )
      .order("updated_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error(error)
      return NextResponse.json(
        {
          error: "manufacturer_products の取得に失敗しました。",
          details: error.message
        },
        { status: 500 }
      )
    }

    const rows =
      (data ?? [])
        .map((r) => {
          const upsertKey = (r as any).upsert_key as string | null
          if (!upsertKey) return null
          const sourceKey = `manufacturer:${upsertKey}`
          return {
            source_name: "manufacturer",
            source_url: (r as any).source_url ?? null,
            source_key: sourceKey,
            raw_text: buildRawTextFromManufacturer({
              upsert_key: upsertKey,
              manufacturer_name: (r as any).manufacturer_name ?? null,
              product_name: (r as any).product_name ?? null,
              flavor: (r as any).flavor ?? null,
              unit_text: (r as any).unit_text ?? null,
              price_text: (r as any).price_text ?? null,
              price_yen: (r as any).price_yen ?? null,
              price_per_kg: (r as any).price_per_kg ?? null,
              source_url: (r as any).source_url ?? null
            }),
            status: "pending"
          }
        })
        .filter(Boolean) as any[]

    const { error: upsertError } = await supabase
      .from("protein_source_texts")
      .upsert(rows, { onConflict: "source_key" })

    if (upsertError) {
      console.error(upsertError)
      return NextResponse.json(
        {
          error: "protein_source_texts への取り込みに失敗しました（manufacturer）。",
          details: upsertError.message
        },
        { status: 500 }
      )
    }
    inserted.manufacturer = rows.length
  }

  return NextResponse.json(
    {
      message:
        "取り込み完了。protein_source_texts に pending を upsert しました（source_key 冪等）。",
      inserted,
      limit
    },
    { status: 200 }
  )
}


import { createClient } from "@supabase/supabase-js"

// dotenv (for local runs)
try {
  // @ts-ignore
  require("dotenv").config({ path: ".env.local" })
  require("dotenv").config()
} catch {
  /* ignore */
}

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)"
  )
}

const supabase = createClient(supabaseUrl, supabaseKey)

const serpApiKey = process.env.SERPAPI_API_KEY
if (!serpApiKey) {
  throw new Error(
    "Missing SERPAPI_API_KEY: set your SerpAPI key in the environment"
  )
}

function parsePriceFromAny(price: any): { raw: string | null; value: number | null } {
  if (!price) return { raw: null, value: null }

  // 文字列または数値の場合
  if (typeof price === "string" || typeof price === "number") {
    const raw = String(price)
    const digits = raw.replace(/[^\d]/g, "")
    if (!digits) return { raw, value: null }
    const v = Number(digits)
    return { raw, value: Number.isFinite(v) ? v : null }
  }

  // { raw, value } 形式
  if (typeof price === "object") {
    const rawCandidate =
      price.raw ??
      price.displayed_price ??
      price.value ??
      price.amount ??
      null
    const raw = rawCandidate != null ? String(rawCandidate) : null

    let numeric: number | null = null
    if (typeof price.value === "number") {
      numeric = price.value
    } else if (typeof price.amount === "number") {
      numeric = price.amount
    } else if (raw) {
      const digits = raw.replace(/[^\d]/g, "")
      if (digits) {
        const v = Number(digits)
        if (Number.isFinite(v)) numeric = v
      }
    }

    return { raw, value: numeric }
  }

  return { raw: null, value: null }
}

function parseAvailabilityFromAny(av: any): {
  raw: string | null
  isAvailable: boolean | null
} {
  if (!av) return { raw: null, isAvailable: null }

  const raw = typeof av === "string" ? av : String(av.text ?? av.status ?? av)
  const lower = raw.toLowerCase()

  // 在庫切れパターン（英語 / 日本語 想定）
  const outPatterns = [
    "out of stock",
    "currently unavailable",
    "temporarily out of stock",
    "在庫切れ",
    "在庫なし",
    "一時的に在庫切れ",
  ]
  const inPatterns = ["in stock", "通常1", "在庫あり"]

  if (outPatterns.some((p) => lower.includes(p))) {
    return { raw, isAvailable: false }
  }
  if (inPatterns.some((p) => lower.includes(p))) {
    return { raw, isAvailable: true }
  }

  return { raw, isAvailable: null }
}

type AmazonProductResult = {
  title?: string
  brand?: string
  main_image?: string
  variants?: Array<{
    title?: string
    items?: Array<{
      asin?: string
      name?: string
      link?: string
      serpapi_link?: string
    }>
  }>
  price?: any
  prices?: any
  offer?: any
  offers?: any
  availability?: any
  availability_status?: any
  in_stock?: any
}

async function fetchAmazonProduct(asin: string): Promise<AmazonProductResult | null> {
  const params = new URLSearchParams({
    engine: "amazon_product",
    amazon_domain: "amazon.co.jp",
    asin,
    api_key: serpApiKey!,
  })

  const res = await fetch(
    `https://serpapi.com/search?${params.toString()}`
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `SerpAPI amazon_product failed for asin=${asin}: ${res.status} ${body.slice(
        0,
        200
      )}`
    )
  }

  const json: any = await res.json()
  return (json.product_results ?? null) as AmazonProductResult | null
}

async function backfillFromAmazonProduct(limit: number) {
  const { data, error } = await supabase
    .from("scraped_products")
    .select("id, asin, price, price_value, availability_raw, is_available")
    .is("price_value", null)
    .not("asin", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`scraped_products fetch failed: ${error.message}`)
  }

  const rows = (data ?? []) as { id: string; asin: string; price: string | null; price_value: number | null }[]
  if (rows.length === 0) {
    console.log("No scraped_products rows without price_value.")
    return
  }

  const updates: {
    id: string
    price: string | null
    price_value: number | null
    availability_raw?: string | null
    is_available?: boolean | null
  }[] = []

  // 1ページ内のフレーバーバリエーションなどから新しい ASIN を見つけた場合に upsert するための配列
  const newVariantRows: {
    asin: string
    title: string
    brand: string
    image_url: string
    price: string | null
    price_value: number | null
    rating: number | null
    source_url: string
  }[] = []

  for (const row of rows) {
    const asin = row.asin
    if (!asin) continue

    try {
      const product = await fetchAmazonProduct(asin)
      if (!product) continue

      const { raw, value } = parsePriceFromAny(
        (product as any).price ??
          (product as any).prices ??
          (product as any).offer ??
          (product as any).offers
      )
      const availabilityInfo = parseAvailabilityFromAny(
        (product as any).availability ??
          (product as any).availability_status ??
          (product as any).in_stock
      )

      // 売り切れなどで価格が取れない場合も、在庫情報だけは保存しておく
      if (raw != null || value != null || availabilityInfo.raw != null) {
        updates.push({
          id: row.id,
          price: raw ?? row.price,
          price_value: value ?? row.price_value,
          availability_raw: availabilityInfo.raw ?? row.availability_raw,
          is_available:
            availabilityInfo.isAvailable ?? row.is_available ?? null,
        })
      }

      // バリエーション情報（カルーセルの別フレーバーなど）から追加の ASIN を拾う
      const variants = (product as any).variants as
        | AmazonProductResult["variants"]
        | undefined

      if (variants && Array.isArray(variants)) {
        for (const group of variants) {
          if (!group?.items || !Array.isArray(group.items)) continue

          for (const item of group.items) {
            const variantAsin = item?.asin
            if (!variantAsin) continue

            // 既に scraped_products にある ASIN は除外（このバッチ対象にも含まれる可能性がある）
            if (rows.some((r) => r.asin === variantAsin)) continue

            const title =
              item.name ||
              (group.title
                ? `${product.title ?? ""} ${group.title}`.trim()
                : product.title ?? "") ||
              ""

            if (!title) continue

            // バリアントの詳細ページ URL（なければ ASIN から推定）
            const link =
              (item as any).link ||
              (product as any).link ||
              `https://www.amazon.co.jp/dp/${variantAsin}`

            newVariantRows.push({
              asin: variantAsin,
              title,
              brand: product.brand ?? "",
              image_url: product.main_image ?? "",
              price: null,
              price_value: null,
              rating: null,
              source_url: link,
            })
          }
        }
      }
    } catch (e) {
      console.error(`failed to fetch details for asin=${asin}`, e)
      continue
    }
  }

  if (updates.length === 0 && newVariantRows.length === 0) {
    console.log("No updates or new variants to apply from amazon_product.")
    return
  }

  if (updates.length > 0) {
    const { error: upsertError } = await supabase
      .from("scraped_products")
      .upsert(updates, { onConflict: "id" })

    if (upsertError) {
      throw new Error(
        `backfill amazon_product upsert failed: ${upsertError.message}`
      )
    }
  }

  if (newVariantRows.length > 0) {
    // ASIN ごとに 1 レコードにまとめてから upsert
    const uniqueVariants = Array.from(
      new Map(newVariantRows.map((v) => [v.asin, v])).values()
    )

    const { error: variantError } = await supabase
      .from("scraped_products")
      .upsert(uniqueVariants, { onConflict: "asin" })

    if (variantError) {
      throw new Error(
        `backfill amazon_product variant upsert failed: ${variantError.message}`
      )
    }
  }

  console.log(
    JSON.stringify(
      {
        message: "backfill amazon product details completed",
        updated: updates.length,
        new_variants: newVariantRows.length,
      },
      null,
      2
    )
  )
}

async function main() {
  const limit = Number(process.env.AMAZON_PRODUCT_BACKFILL_LIMIT ?? "50")
  await backfillFromAmazonProduct(limit)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


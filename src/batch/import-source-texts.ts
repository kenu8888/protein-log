import { createClient } from "@supabase/supabase-js"

// Load .env.local then .env for local runs
try {
  // @ts-ignore - optional; run: npm install dotenv
  require("dotenv").config({ path: ".env.local" })
  require("dotenv").config()
} catch {
  /* use process.env */
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

function buildRawTextFromAmazon(row: any) {
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

function buildRawTextFromManufacturer(row: any) {
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

async function importAmazon(limit: number) {
  const { data, error } = await supabase
    .from("scraped_products")
    .select("asin, title, brand, price, rating, source_url")
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`scraped_products fetch failed: ${error.message}`)

  const records = (data ?? []).filter((r: any) => !!r.asin)
  if (records.length === 0) return 0

  // 新規は insert されて status が default 'pending' になる。
  // 既存は upsert で更新されるが status カラムは送らないので、processed/excluded のまま維持される。
  const rows = records.map((r: any) => ({
    source_name: "amazon",
    source_url: r.source_url ?? null,
    source_key: `amazon:${r.asin}`,
    raw_text: buildRawTextFromAmazon(r)
  }))

  const { error: upsertError } = await supabase
    .from("protein_source_texts")
    .upsert(rows as any, { onConflict: "source_key" })

  if (upsertError)
    throw new Error(`amazon import failed: ${upsertError.message}`)
  return rows.length
}

async function importManufacturer(limit: number) {
  const { data, error } = await supabase
    .from("manufacturer_products")
    .select(
      "upsert_key, manufacturer_name, product_name, flavor, unit_text, price_text, price_yen, price_per_kg, source_url"
    )
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`manufacturer_products fetch failed: ${error.message}`)

  const records = (data ?? []).filter((r: any) => !!r.upsert_key)
  if (records.length === 0) return 0

  const rows = records.map((r: any) => ({
    source_name: "manufacturer",
    source_url: r.source_url ?? null,
    source_key: `manufacturer:${r.upsert_key}`,
    raw_text: buildRawTextFromManufacturer(r)
  }))

  const { error: upsertError } = await supabase
    .from("protein_source_texts")
    .upsert(rows as any, { onConflict: "source_key" })

  if (upsertError)
    throw new Error(`manufacturer import failed: ${upsertError.message}`)
  return rows.length
}

async function main() {
  const limit = Number(process.env.IMPORT_LIMIT ?? "500")

  const amazonCount = await importAmazon(limit)
  const manufacturerCount = await importManufacturer(limit)

  console.log(
    JSON.stringify(
      {
        message: "Import finished",
        amazon: amazonCount,
        manufacturer: manufacturerCount,
        limit
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


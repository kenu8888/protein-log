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

function parseWeightKgFromTitle(title: string): number | null {
  const t = title.replace(/，/g, ",").replace(/＊/g, "x")

  // パターン1: 2kg, 2.5 kg など
  const kgMatch = t.match(/(\d+(?:\.\d+)?)\s*(kg|KG|Kg|ｋｇ)/)
  if (kgMatch) {
    const v = parseFloat(kgMatch[1])
    if (!isNaN(v) && v > 0) return v
  }

  // パターン2: 1000g, 900 g など
  const gMatch = t.match(/(\d+(?:\.\d+)?)\s*(g|G|グラム)/)
  if (gMatch) {
    const v = parseFloat(gMatch[1])
    if (!isNaN(v) && v > 0) return v / 1000
  }

  // パターン3: 500g×2, 1kg x 3 など
  const multiKgMatch = t.match(
    /(\d+(?:\.\d+)?)\s*(kg|KG|Kg|ｋｇ)\s*[×xX*]\s*(\d+)/
  )
  if (multiKgMatch) {
    const unit = parseFloat(multiKgMatch[1])
    const count = parseInt(multiKgMatch[3], 10)
    if (!isNaN(unit) && !isNaN(count) && unit > 0 && count > 0) {
      return unit * count
    }
  }

  const multiGMatch = t.match(/(\d+(?:\.\d+)?)\s*(g|G|グラム)\s*[×xX*]\s*(\d+)/)
  if (multiGMatch) {
    const unit = parseFloat(multiGMatch[1])
    const count = parseInt(multiGMatch[3], 10)
    if (!isNaN(unit) && !isNaN(count) && unit > 0 && count > 0) {
      return (unit * count) / 1000
    }
  }

  return null
}

async function backfill(limit: number) {
  const { data, error } = await supabase
    .from("scraped_products")
    .select("id, title, price_value, net_weight_kg, price_per_kg")
    .not("price_value", "is", null)
    .or("net_weight_kg.is.null,price_per_kg.is.null")
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`scraped_products fetch failed: ${error.message}`)

  const rows = (data ?? []) as any[]
  if (rows.length === 0) {
    console.log("No rows to backfill.")
    return
  }

  const updates: any[] = []
  for (const row of rows) {
    const priceValue =
      typeof row.price_value === "number" ? (row.price_value as number) : null
    if (priceValue == null || priceValue <= 0) continue

    let weightKg =
      typeof row.net_weight_kg === "number" ? (row.net_weight_kg as number) : null

    if (weightKg == null || weightKg <= 0) {
      weightKg = parseWeightKgFromTitle(row.title ?? "")
    }

    if (!weightKg || weightKg <= 0) continue

    const pricePerKg = priceValue / weightKg
    updates.push({
      id: row.id,
      net_weight_kg: weightKg,
      price_per_kg: pricePerKg,
    })
  }

  if (updates.length === 0) {
    console.log("No rows with parsable weight.")
    return
  }

  const { error: upsertError } = await supabase
    .from("scraped_products")
    .upsert(updates, { onConflict: "id" })

  if (upsertError)
    throw new Error(`backfill upsert failed: ${upsertError.message}`)

  console.log(
    JSON.stringify(
      {
        message: "backfill amazon weight completed",
        updated: updates.length,
      },
      null,
      2,
    ),
  )
}

async function main() {
  const limit = Number(process.env.BACKFILL_LIMIT ?? "500")
  await backfill(limit)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


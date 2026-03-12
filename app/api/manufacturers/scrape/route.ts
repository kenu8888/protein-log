import { NextResponse } from "next/server"
import { load } from "cheerio"
import { supabase } from "../../../../lib/supabase"

type ManufacturerSource = {
  id: string
  manufacturer_name: string
  url: string
}

function buildUpsertKey(p: {
  manufacturer_name: string
  product_name: string
  flavor: string | null
  unit_text: string | null
}): string {
  return [
    p.manufacturer_name,
    p.product_name ?? "",
    p.flavor ?? "",
    p.unit_text ?? ""
  ].join("|")
}

type ParsedProduct = {
  manufacturer_name: string
  product_name: string
  flavor: string | null
  unit_text: string | null
  unit_kg: number | null
  price_text: string | null
  price_yen: number | null
  price_per_kg: number | null
  source_url: string
}

const MIN_DELAY_MS = 1500
const MAX_DELAY_MS = 4000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function randomDelay() {
  return (
    MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS))
  )
}

function parseUnit(text: string): { unit_text: string | null; unit_kg: number | null } {
  const match = text.match(/([\d.,]+)\s*(kg|g)\b/i)
  if (!match) return { unit_text: null, unit_kg: null }

  const raw = match[1].replace(/,/g, "")
  const value = Number(raw)
  if (!Number.isFinite(value)) return { unit_text: match[0], unit_kg: null }

  const unit = match[2].toLowerCase()
  const kg = unit === "kg" ? value : value / 1000

  return { unit_text: match[0], unit_kg: kg }
}

function parsePrice(text: string): { price_text: string | null; price_yen: number | null } {
  const match = text.match(/¥\s*([\d,]+)/)
  if (!match) return { price_text: null, price_yen: null }

  const priceText = `¥${match[1]}`
  const numeric = Number(match[1].replace(/,/g, ""))
  if (!Number.isFinite(numeric)) {
    return { price_text: priceText, price_yen: null }
  }

  return { price_text: priceText, price_yen: numeric }
}

function extractFlavorFromText(text: string): string | null {
  const flavorKeywords = [
    "チョコ",
    "ココア",
    "バニラ",
    "ストロベリー",
    "ベリー",
    "ミルク",
    "カフェ",
    "コーヒー",
    "抹茶",
    "マンゴー",
    "レモン",
    "ヨーグルト",
    "クッキー",
    "キャラメル"
  ]

  const hit = flavorKeywords.find((kw) => text.includes(kw))
  return hit ?? null
}

function parseManufacturerPage(
  html: string,
  baseUrl: string,
  manufacturerName: string
): ParsedProduct[] {
  const $ = load(html)
  const candidates: ParsedProduct[] = []

  const selectors = ["[class*=product]", "[class*=item]", "li", "article", ".card"]

  $(selectors.join(",")).each((_, el) => {
    const container = $(el)
    const text = container.text().replace(/\s+/g, " ").trim()
    if (!text) return

    const priceInfo = parsePrice(text)
    const unitInfo = parseUnit(text)

    if (!priceInfo.price_text && !unitInfo.unit_text) return

    const product_name = text.slice(0, 80)
    const flavor = extractFlavorFromText(text)

    let href = container.find("a").first().attr("href") ?? container.attr("href") ?? ""
    let source_url = baseUrl
    try {
      if (href) {
        source_url = new URL(href, baseUrl).toString()
      }
    } catch {
      source_url = baseUrl
    }

    const price_per_kg =
      priceInfo.price_yen && unitInfo.unit_kg
        ? Math.round((priceInfo.price_yen / unitInfo.unit_kg) * 10) / 10
        : null

    candidates.push({
      manufacturer_name: manufacturerName,
      product_name,
      flavor,
      unit_text: unitInfo.unit_text,
      unit_kg: unitInfo.unit_kg,
      price_text: priceInfo.price_text,
      price_yen: priceInfo.price_yen,
      price_per_kg,
      source_url
    })
  })

  const unique = new Map<string, ParsedProduct>()
  for (const p of candidates) {
    const key = buildUpsertKey(p)
    if (!unique.has(key)) unique.set(key, p)
  }

  return Array.from(unique.values()).slice(0, 200)
}

export async function POST() {
  const { data: sources, error } = await supabase
    .from("manufacturer_sources")
    .select("id, manufacturer_name, url")

  if (error) {
    console.error(error)
    return NextResponse.json(
      { error: "manufacturer_sources の取得に失敗しました。" },
      { status: 500 }
    )
  }

  if (!sources || sources.length === 0) {
    return NextResponse.json(
      { message: "manufacturer_sources に URL が登録されていません。" },
      { status: 200 }
    )
  }

  const allParsed: ParsedProduct[] = []

  for (const src of sources as ManufacturerSource[]) {
    try {
      const res = await fetch(src.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        }
      })

      if (!res.ok) {
        console.warn(`Failed to fetch ${src.url}: ${res.status}`)
        continue
      }

      const html = await res.text()
      const parsed = parseManufacturerPage(html, src.url, src.manufacturer_name)

      if (parsed.length > 0) {
        allParsed.push(...parsed)
      }

      await sleep(randomDelay())
    } catch (e) {
      console.error(`Error while scraping ${src.url}`, e)
    }
  }

  if (allParsed.length === 0) {
    return NextResponse.json(
      {
        message:
          "登録された URL から商品情報を抽出できませんでした。サイトごとの専用パーサーが必要な可能性があります。"
      },
      { status: 200 }
    )
  }

  const rows = allParsed.map((p) => ({
    ...p,
    upsert_key: buildUpsertKey(p)
  }))

  const { error: upsertError } = await supabase
    .from("manufacturer_products")
    .upsert(rows, { onConflict: "upsert_key" })

  if (upsertError) {
    console.error(upsertError)
    const code = upsertError.code ?? ""
    const isMissingColumn =
      code === "42703" ||
      code === "undefined_column" ||
      /upsert_key|column.*does not exist/i.test(upsertError.message ?? "")

    if (isMissingColumn) {
      const { error: insertError } = await supabase
        .from("manufacturer_products")
        .insert(allParsed)

      if (insertError) {
        console.error(insertError)
        return NextResponse.json(
          {
            error: "manufacturer_products への保存に失敗しました。",
            details: insertError.message
          },
          { status: 500 }
        )
      }
      return NextResponse.json(
        {
          message:
            "manufacturer_products に保存しました。upsert 用のカラム（upsert_key）がないため insert で実行しています。上書き・新着判定を使う場合はマイグレーションを実行してください。",
          total_products: allParsed.length,
          manufacturers: Array.from(
            new Set(allParsed.map((p) => p.manufacturer_name))
          ).length
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        error: "manufacturer_products への保存に失敗しました。",
        details: upsertError.message
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      message:
        "メーカーサイトからの商品情報を保存しました。同一キーは価格など上書き、新規は first_seen_at で判別できます。",
      total_products: rows.length,
      manufacturers: Array.from(
        new Set(rows.map((p) => p.manufacturer_name))
      ).length
    },
    { status: 200 }
  )
}


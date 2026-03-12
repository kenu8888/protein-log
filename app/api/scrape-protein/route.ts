import { NextResponse } from "next/server"
import { supabase } from "../../../lib/supabase"

type ScrapedProduct = {
  asin: string
  title: string
  brand: string
  image_url: string
  price: string
  price_value: number | null
  rating: number | null
  source_url: string
}

type SerpApiAmazonResponse = {
  organic_results?: Array<{
    asin?: string
    title?: string
    link?: string
    thumbnail?: string
    price?: { raw?: string; value?: number }
    rating?: number
    brand?: string
  }>
  featured_products?: Array<{
    products?: Array<{
      asin?: string
      title?: string
      link?: string
      thumbnail?: string
      price?: { raw?: string; value?: number }
      rating?: number
      brand?: string
    }>
  }>
}

function parsePriceValueFromRaw(raw: string | undefined | null): number | null {
  if (!raw) return null
  // 例: "￥3,980", "¥3,980", "3,980円" などから数字だけを抜き出して数値化
  const digits = raw.replace(/[^\d]/g, "")
  if (!digits) return null
  const v = Number(digits)
  return Number.isFinite(v) ? v : null
}

export async function POST() {
  const apiKey = process.env.SERPAPI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "SERPAPI_API_KEY が設定されていません。環境変数に SerpAPI の API キーを設定してください。"
      },
      { status: 500 }
    )
  }

  const rawTerm = process.env.AMAZON_PROTEIN_SEARCH_TERM
  const searchTerm =
    rawTerm && rawTerm.trim().length > 0
      ? rawTerm.trim()
      : "プロテイン ホエイ サプリメント"

  const url = new URL("https://serpapi.com/search.json")
  url.searchParams.set("engine", "amazon")
  url.searchParams.set("amazon_domain", "amazon.co.jp")
  // Amazon エンジンはクエリに `k` パラメータを使用する
  url.searchParams.set("k", searchTerm)
  url.searchParams.set("api_key", apiKey)

  try {
    const response = await fetch(url.toString())

    if (!response.ok) {
      const body = await response.text()
      console.error("SerpAPI error body:", body)
      return NextResponse.json(
        {
          error: `SerpAPI request failed: ${response.status}`,
          details: body.slice(0, 300)
        },
        { status: 502 }
      )
    }

    const data = (await response.json()) as SerpApiAmazonResponse

    const products: ScrapedProduct[] = []

    const organic = data.organic_results ?? []
    for (const item of organic) {
      if (!item.asin || !item.title || !item.link) continue
      const priceRaw = item.price?.raw ?? ""
      let priceValue =
        typeof item.price?.value === "number" ? item.price.value : null
      if (priceValue == null) {
        priceValue = parsePriceValueFromRaw(priceRaw)
      }

      products.push({
        asin: item.asin,
        title: item.title,
        brand: item.brand ?? "",
        image_url: item.thumbnail ?? "",
        price: priceRaw || (priceValue != null ? `${priceValue}` : ""),
        price_value: priceValue,
        rating:
          typeof item.rating === "number" && Number.isFinite(item.rating)
            ? item.rating
            : null,
        source_url: item.link
      })
    }

    const featuredBlocks = data.featured_products ?? []
    for (const block of featuredBlocks) {
      for (const item of block.products ?? []) {
        if (!item.asin || !item.title || !item.link) continue
        if (products.find((p) => p.asin === item.asin)) continue

        const priceRaw = item.price?.raw ?? ""
        let priceValue =
          typeof item.price?.value === "number" ? item.price.value : null
        if (priceValue == null) {
          priceValue = parsePriceValueFromRaw(priceRaw)
        }

        products.push({
          asin: item.asin,
          title: item.title,
          brand: item.brand ?? "",
          image_url: item.thumbnail ?? "",
          price: priceRaw || (priceValue != null ? `${priceValue}` : ""),
          price_value: priceValue,
          rating:
            typeof item.rating === "number" && Number.isFinite(item.rating)
              ? item.rating
              : null,
          source_url: item.link
        })
      }
    }

    // SerpAPI 側の重複などで同じ ASIN が複数回入っていると
    // Postgres の ON CONFLICT DO UPDATE が「同じ行を2回更新しようとしている」と怒るので、
    // ここであらかじめ ASIN ごとに 1 件にまとめる
    const uniqueByAsin = Array.from(
      new Map(products.map((p) => [p.asin, p])).values()
    )

    if (uniqueByAsin.length === 0) {
      return NextResponse.json(
        { message: "SerpAPI から商品データを取得できませんでした。" },
        { status: 200 }
      )
    }

    const { error } = await supabase
      .from("scraped_products")
      .upsert(uniqueByAsin, { onConflict: "asin" })

    if (error) {
      console.error("Failed to upsert scraped products", error)
      return NextResponse.json(
        {
          error: "Failed to save scraped products",
          details: error.message,
          code: error.code,
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        count: uniqueByAsin.length,
        message:
          "SerpAPI の Amazon エンジンから商品情報を取得し、scraped_products に保存しました。"
      },
      { status: 200 }
    )
  } catch (e) {
    console.error(e)
    return NextResponse.json(
      { error: "Unexpected error during SerpAPI request" },
      { status: 500 }
    )
  }
}



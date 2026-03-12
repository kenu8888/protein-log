import { NextResponse } from "next/server"
import { load } from "cheerio"
import { supabase } from "../../../../../lib/supabase"

type ScrapedBrandProduct = {
  brand_id: string
  product_name: string
  flavor_name: string | null
  price_text: string | null
  source_url: string
}

function parseBrandPage(html: string, baseUrl: string, brandId: string) {
  const $ = load(html)
  const results: ScrapedBrandProduct[] = []

  // 非常にざっくりしたジェネリックパーサー。
  // 実運用ではブランドごとに専用のパーサーを用意する想定。
  $("a, li, .product, .card").each((_, el) => {
    const container = $(el)
    const text = container.text().replace(/\s+/g, " ").trim()
    if (!text) return

    // 価格らしきテキスト
    const priceMatch = text.match(/¥[\d,]+|[0-9,]+円/)
    const price_text = priceMatch ? priceMatch[0] : null

    // 商品名らしきテキスト（先頭 30〜40 文字程度）
    const product_name = text.slice(0, 60)

    if (!price_text && product_name.length < 10) return

    const href = container.attr("href") ?? ""
    const source_url = href ? new URL(href, baseUrl).toString() : baseUrl

    results.push({
      brand_id: brandId,
      product_name,
      flavor_name: null,
      price_text,
      source_url
    })
  })

  // 重複を簡易的に削除
  const unique = new Map<string, ScrapedBrandProduct>()
  for (const r of results) {
    const key = `${r.brand_id}:${r.product_name}:${r.price_text}:${r.source_url}`
    if (!unique.has(key)) unique.set(key, r)
  }

  return Array.from(unique.values()).slice(0, 100)
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const brandId = params.id

  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("id, name, website_url")
    .eq("id", brandId)
    .maybeSingle()

  if (brandError || !brand) {
    return NextResponse.json(
      { error: "ブランドが見つかりませんでした。" },
      { status: 404 }
    )
  }

  if (!brand.website_url) {
    return NextResponse.json(
      { error: "このブランドには website_url が設定されていません。" },
      { status: 400 }
    )
  }

  try {
    const res = await fetch(brand.website_url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
      }
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `ブランドサイトへのアクセスに失敗しました: ${res.status}` },
        { status: 502 }
      )
    }

    const html = await res.text()
    const parsed = parseBrandPage(html, brand.website_url, brand.id)

    if (parsed.length === 0) {
      return NextResponse.json(
        {
          message:
            "ブランドサイトから商品情報らしきデータを抽出できませんでした。サイトごとの専用パーサー実装が必要です。"
        },
        { status: 200 }
      )
    }

    const { error: insertError } = await supabase
      .from("scraped_brand_products")
      .insert(parsed)

    if (insertError) {
      console.error(insertError)
      return NextResponse.json(
        { error: "商品情報の保存に失敗しました。" },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        message: "ブランドサイトから商品情報を抽出・保存しました。",
        brand: brand.name,
        count: parsed.length
      },
      { status: 200 }
    )
  } catch (e) {
    console.error(e)
    return NextResponse.json(
      { error: "ブランドサイト解析中にエラーが発生しました。" },
      { status: 500 }
    )
  }
}


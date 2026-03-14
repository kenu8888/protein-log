import { NextResponse } from "next/server"
import { supabase } from "../../../../lib/supabase"

const RAKUTEN_ITEM_SEARCH_URL =
  "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706"

type RakutenItem = {
  itemCode: string
  itemName: string
  itemPrice: number
  itemUrl: string
  shopName?: string
  mediumImageUrls?: Array<{ imageUrl: string }>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(req: Request) {
  const applicationId = process.env.RAKUTEN_APPLICATION_ID
  if (!applicationId) {
    return NextResponse.json(
      {
        error:
          "楽天APIのアプリIDが設定されていません。.env.local に RAKUTEN_APPLICATION_ID を設定してください。"
      },
      { status: 500 }
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    keyword?: string
    maxPages?: number
  }
  const keyword = body.keyword ?? "プロテイン"
  const maxPages = Math.min(Math.max(body.maxPages ?? 10, 1), 30)

  const allItems: RakutenItem[] = []

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      applicationId,
      keyword,
      format: "json",
      formatVersion: "2",
      hits: "30",
      page: String(page)
    })

    const url = `${RAKUTEN_ITEM_SEARCH_URL}?${params.toString()}`
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ProteinLog/1.0; +https://github.com/your-repo)"
      }
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`Rakuten API error page=${page}:`, res.status, text)
      return NextResponse.json(
        {
          error: `楽天APIの取得に失敗しました（page=${page}）。`,
          details: text.slice(0, 500)
        },
        { status: 502 }
      )
    }

    const data = (await res.json()) as {
      Items?: Array<{ item?: Record<string, unknown> } & Record<string, unknown>>
      items?: Array<{ item?: Record<string, unknown> } & Record<string, unknown>>
    }

    const rawItems = data.Items ?? data.items ?? []
    if (rawItems.length === 0) break

    for (const raw of rawItems) {
      const it = (raw.item ?? raw) as Record<string, unknown>
      const code = typeof it.itemCode === "string" ? it.itemCode : ""
      if (!code) continue
      const imageArr = it.mediumImageUrls as Array<{ imageUrl?: string }> | undefined
      allItems.push({
        itemCode: code,
        itemName: typeof it.itemName === "string" ? it.itemName : "",
        itemPrice: typeof it.itemPrice === "number" ? it.itemPrice : 0,
        itemUrl: typeof it.itemUrl === "string" ? it.itemUrl : "",
        shopName: typeof it.shopName === "string" ? it.shopName : undefined,
        mediumImageUrls: imageArr
      })
    }

    if (items.length < 30) break
    await sleep(1000)
  }

  if (allItems.length === 0) {
    return NextResponse.json(
      { message: "取得した商品が0件でした。", total: 0 },
      { status: 200 }
    )
  }

  const rows = allItems.map((it) => ({
    item_code: it.itemCode,
    title: it.itemName || null,
    shop_name: it.shopName || null,
    image_url:
      it.mediumImageUrls?.[0]?.imageUrl ?? null,
    price: it.itemPrice > 0 ? `${it.itemPrice}円` : null,
    price_value: it.itemPrice > 0 ? it.itemPrice : null,
    source_url: it.itemUrl || null
  }))

  const { error } = await supabase
    .from("rakuten_products")
    .upsert(rows, { onConflict: "item_code" })

  if (error) {
    console.error("rakuten_products upsert error:", error)
    return NextResponse.json(
      { error: "rakuten_products への保存に失敗しました。", details: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    message: "楽天商品を取得し、rakuten_products に保存しました。",
    total: rows.length,
    keyword,
    maxPages
  })
}

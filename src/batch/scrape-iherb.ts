import { createClient } from "@supabase/supabase-js"
import { load } from "cheerio"

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

type IHerbRecord = {
  source_key: string
  source_url: string
  raw_text: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildRawTextFromIHerb(args: {
  brand: string | null
  title: string | null
  price: string | null
  size: string | null
  rating: string | null
  url: string
}) {
  return [
    "【iHerb】",
    args.brand ? `ブランド: ${args.brand}` : null,
    args.title ? `商品名: ${args.title}` : null,
    args.price ? `価格: ${args.price}` : null,
    args.size ? `容量: ${args.size}` : null,
    args.rating ? `評価: ${args.rating}` : null,
    args.url ? `URL: ${args.url}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

function parseIHerbProducts(html: string, pageUrl: string): IHerbRecord[] {
  const $ = load(html)
  const seenKeys = new Set<string>()
  const results: IHerbRecord[] = []

  // iHerb の商品詳細ページは多くが /pr/ を含む URL になっている想定
  $("a[href*='/pr/']").each((_, el) => {
    const a = $(el)
    const href = a.attr("href") ?? ""
    if (!href) return

    let url = pageUrl
    try {
      url = new URL(href, pageUrl).toString()
    } catch {
      url = href
    }

    // /pr/<product-id>/ の <product-id> を source_key に使う
    let keyPart = url
    const m = url.match(/\/pr\/([^/?]+)/)
    if (m && m[1]) {
      keyPart = m[1]
    }
    const source_key = `iherb:${keyPart}`
    if (seenKeys.has(source_key)) return

    // 可能であれば商品カードっぽい親要素を拾う
    const card =
      a.closest(".product-cell") ||
      a.closest(".product-card") ||
      a.closest("div")

    const title =
      (a.attr("title") ?? a.text() ?? "")
        .replace(/\s+/g, " ")
        .trim() || null

    const brand =
      card.find(".brand-name, .product-brand-name").first().text().trim() ||
      null

    const price =
      card
        .find(
          ".price, .product-price, .price-current, [data-ga-event-label*='Price']"
        )
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim() || null

    // 容量らしきテキスト（"1 lb", "907 g" など）をカード内から拾う
    const sizeMatch = card
      .text()
      .replace(/\s+/g, " ")
      .match(/(\d+(?:[\.,]\d+)?)\s*(lb|g|kg|servings|回分)/i)
    const size = sizeMatch ? sizeMatch[0] : null

    const rating =
      card
        .find(".rating, .rating-stars, .stars")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim() || null

    const raw_text = buildRawTextFromIHerb({
      brand,
      title,
      price,
      size,
      rating,
      url,
    })

    results.push({
      source_key,
      source_url: url,
      raw_text,
    })
    seenKeys.add(source_key)
  })

  return results
}

async function scrapeIHerbSearch(pages: number) {
  const keyword = process.env.IHERB_SEARCH_KEYWORD ?? "プロテイン"
  const encoded = encodeURIComponent(keyword)
  const all: IHerbRecord[] = []

  for (let p = 1; p <= pages; p++) {
    const url =
      p === 1
        ? `https://jp.iherb.com/search?kw=${encoded}`
        : `https://jp.iherb.com/search?kw=${encoded}&p=${p}`

    console.log(`Fetching iHerb page ${p}: ${url}`)

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    })

    if (!res.ok) {
      console.warn(`iHerb page ${p} fetch failed: ${res.status}`)
      continue
    }

    const html = await res.text()
    const records = parseIHerbProducts(html, url)
    console.log(`Parsed ${records.length} products from page ${p}`)
    all.push(...records)

    // iHerb への負荷を抑えるために軽くウェイトを入れる
    await sleep(1500 + Math.random() * 1500)
  }

  if (all.length === 0) {
    console.log("No products parsed from iHerb search.")
    return
  }

  const { error } = await supabase
    .from("protein_source_texts")
    .upsert(
      all.map((r) => ({
        source_name: "iherb",
        source_url: r.source_url,
        source_key: r.source_key,
        raw_text: r.raw_text,
      })) as any,
      { onConflict: "source_key" }
    )

  if (error) {
    throw new Error(`iHerb import failed: ${error.message}`)
  }

  console.log(
    JSON.stringify(
      {
        message: "iHerb import finished",
        keyword,
        pages,
        imported: all.length,
      },
      null,
      2
    )
  )
}

async function main() {
  const pages = Number(process.env.IHERB_PAGES ?? "5")
  await scrapeIHerbSearch(pages)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


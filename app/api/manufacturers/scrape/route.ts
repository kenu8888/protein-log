import { NextResponse } from "next/server"
import { load } from "cheerio"
import { supabase } from "../../../../lib/supabase"

type ManufacturerSource = {
  id: string
  manufacturer_name: string
  url: string
  manufacturer_code: string | null
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
  manufacturer_code?: string | null
  product_name: string
  flavor: string | null
  unit_text: string | null
  unit_kg: number | null
  price_text: string | null
  price_yen: number | null
  price_per_kg: number | null
  image_url: string | null
  source_url: string
  // 元ページから取得した生のテキスト（再パースやパーサー改善用）
  raw_product_name?: string | null
  raw_flavor?: string | null
  raw_unit_text?: string | null
  raw_price_text?: string | null
}

const MIN_DELAY_MS = 1500
const MAX_DELAY_MS = 4000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function randomDelay() {
  return (
    MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS))
  )
}

async function enrichImagesFromDetailPages(products: ParsedProduct[]) {
  const MAX_DETAIL_FETCHES = 50
  let fetchedCount = 0

  for (const p of products) {
    if (p.image_url) continue
    if (!p.source_url) continue
    if (fetchedCount >= MAX_DETAIL_FETCHES) break

    try {
      const res = await fetch(p.source_url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        }
      })
      if (!res.ok) continue

      const html = await res.text()
      const $ = load(html)

      // 1. og:image 系のメタタグを優先
      let imgSrc =
        $('meta[property="og:image"]').attr("content") ??
        $('meta[name="og:image"]').attr("content") ??
        $('meta[property="og:image:url"]').attr("content") ??
        ""

      // 2. なければ main / .product / 全体の img を順番に探す
      if (!imgSrc) {
        const imgEl = $("main img, .product img, img").first()
        imgSrc =
          imgEl.attr("data-src") ??
          imgEl.attr("data-original") ??
          imgEl.attr("src") ??
          ""
      }

      if (imgSrc) {
        try {
          p.image_url = new URL(imgSrc, p.source_url).toString()
        } catch {
          p.image_url = imgSrc
        }
      }

      fetchedCount += 1
      await sleep(randomDelay())
    } catch (e) {
      console.error(`failed to enrich image for ${p.source_url}`, e)
    }
  }
}

// 一覧カードだけではプロテインか判定しづらい商品について、
// 商品個別ページを数件だけ取得して再判定し、プロテインのみを残す
async function filterProductsUsingDetailPages(
  products: ParsedProduct[]
): Promise<ParsedProduct[]> {
  const MAX_DETAIL_FETCHES = 30
  let fetchedCount = 0

  const result: ParsedProduct[] = []

  for (const p of products) {
    const baseText = (p.raw_product_name ?? p.product_name ?? "").trim()
    const decision = evaluateProteinText(baseText)

    if (decision === "exclude") {
      continue
    }
    if (decision === "include") {
      result.push(p)
      continue
    }

    // decision === "unknown" の場合だけ、余裕があれば商品詳細ページを見に行く
    if (!p.source_url || fetchedCount >= MAX_DETAIL_FETCHES) {
      // 詳細を見に行けない場合はノイズ混入を避けるためスキップ
      continue
    }

    try {
      const res = await fetch(p.source_url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
      })
      if (!res.ok) continue

      const html = await res.text()
      const $ = load(html)

      // タイトル + 商品説明 + 栄養成分あたりをざっくりまとめてテキスト化
      const title = $("h1")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim()
      const desc = $(".product-description, .description, main")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim()
      const nutrition = $(".nutritional-info-container, table")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim()

      const detailText = [title, desc, nutrition]
        .filter(Boolean)
        .join(" ")
        .slice(0, 2000)

      if (!detailText) continue

      const detailDecision = evaluateProteinText(detailText)
      if (detailDecision === "exclude") {
        continue
      }

      // 詳細ページテキストを raw_product_name として保持（AI 判定に活用）
      p.raw_product_name = detailText
      result.push(p)

      fetchedCount += 1
      await sleep(randomDelay())
    } catch (e) {
      console.error(`failed to refine product by detail page: ${p.source_url}`, e)
      continue
    }
  }

  return result
}

function parseUnit(text: string): { unit_text: string | null; unit_kg: number | null } {
  // パターン1: 「1kg×3袋」「250g x 2 個」などの総量
  const packMatch = text.match(/([\d.,]+)\s*(kg|g)\s*[×xX]\s*([\d.,]+)/i)
  if (packMatch) {
    const rawAmount = packMatch[1].replace(/,/g, "")
    const rawCount = packMatch[3].replace(/,/g, "")
    const amount = Number(rawAmount)
    const count = Number(rawCount)
    if (Number.isFinite(amount) && Number.isFinite(count)) {
      const unit = packMatch[2].toLowerCase()
      const perPackKg = unit === "kg" ? amount : amount / 1000
      return {
        unit_text: packMatch[0],
        unit_kg: perPackKg * count
      }
    }
  }

  // パターン2: 「1kg / 2.5kg / 5kg」など複数サイズ → 最小サイズを採用
  const allMatches = Array.from(
    text.matchAll(/([\d.,]+)\s*(kg|g)\b/gi)
  )
  if (allMatches.length === 0) {
    return { unit_text: null, unit_kg: null }
  }

  let bestKg: number | null = null
  let bestText: string | null = null

  for (const m of allMatches) {
    const raw = (m[1] ?? "").replace(/,/g, "")
    const value = Number(raw)
    if (!Number.isFinite(value)) continue
    const unit = (m[2] ?? "").toLowerCase()
    const kg = unit === "kg" ? value : value / 1000
    if (bestKg == null || kg < bestKg) {
      bestKg = kg
      bestText = m[0] ?? null
    }
  }

  if (bestKg == null) {
    return { unit_text: null, unit_kg: null }
  }

  return { unit_text: bestText, unit_kg: bestKg }
}

function parsePrice(text: string): { price_text: string | null; price_yen: number | null } {
  // パターン例: ¥1,980 / 1,980円 / 税込1,980円
  const match = text.match(/(?:[¥￥]\s*([\d,]+)|([\d,]+)\s*円)/)
  if (!match) return { price_text: null, price_yen: null }

  const raw = (match[1] ?? match[2] ?? "").replace(/,/g, "")
  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) {
    return { price_text: match[0], price_yen: null }
  }

  return { price_text: match[0], price_yen: numeric }
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

type ProteinTextDecision = "include" | "exclude" | "unknown"

function evaluateProteinText(text: string): ProteinTextDecision {
  const lower = text.toLowerCase()

  const includesAny = (words: string[]) =>
    words.some((w) => lower.includes(w))

  // 明らかに除外したいもの（サプリ・お菓子・バー系）
  const excludeKeywords = [
    "bcaa",
    "eaa",
    "hmb",
    "クレアチン",
    "creatine",
    "サプリメント",
    "サプリ",
    "ビタミン",
    "ミネラル",
    "マルチビタミン",
    "バー",
    "クッキー",
    "ゼリー",
    "グミ",
    "キャンディ",
    "チョコレート",
    "スナック",
    "タブレット",
    "カプセル",
  ]

  if (includesAny(excludeKeywords)) {
    return "exclude"
  }

  // 積極的に含めたいプロテイン関連キーワード
  const includeKeywords = [
    "プロテイン",
    "protein",
    "ホエイ",
    "wpc",
    "wpi",
    "カゼイン",
    "ソイプロテイン",
    "ソイ プロテイン",
    "大豆たんぱく",
    "大豆タンパク",
  ]

  if (includesAny(includeKeywords)) {
    return "include"
  }

  return "unknown"
}

function isLikelyProtein(text: string): boolean {
  return evaluateProteinText(text) === "include"
}

function parseManufacturerPage(
  html: string,
  baseUrl: string,
  manufacturerName: string,
  manufacturerCode: string | null
): ParsedProduct[] {
  const $ = load(html)
  const candidates: ParsedProduct[] = []

  const selectors = ["[class*=product]", "[class*=item]", "li", "article", ".card"]

  $(selectors.join(",")).each((_, el) => {
    const container = $(el)
    const text = container.text().replace(/\s+/g, " ").trim()
    if (!text) return

    // 一覧カードレベルで明らかに「プロテインではない」と判断できるものはここで除外
    const decision = evaluateProteinText(text)
    if (decision === "exclude") return

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

    // 画像（カード内の img / picture を優先し、次にページ内の代表画像を fallback）
    let image_url: string | null = null

    const pickSrcFromElement = (el: cheerio.Cheerio) => {
      // imgタグ
      const img =
        el.is("img") || el.find("img").length > 0
          ? (el.is("img") ? el : el.find("img").first())
          : null
      if (img && img.length > 0) {
        const imgSrc =
          img.attr("data-src") ??
          img.attr("data-original") ??
          img.attr("src") ??
          ""
        if (imgSrc) return imgSrc
      }

      // picture > source の srcset
      const source =
        el.is("source") || el.find("source").length > 0
          ? (el.is("source") ? el : el.find("source").first())
          : null
      const srcset =
        source?.attr("data-srcset") ??
        source?.attr("srcset") ??
        ""
      if (srcset) {
        // "url1 1x, url2 2x" のような形式を想定し、最初のURLを採用
        const first = srcset.split(",")[0]?.trim().split(" ")[0]
        if (first) return first
      }

      return ""
    }

    // 1. カード内の img / picture を探す
    const imgInCard =
      container.find("img, picture source, picture img").first()
    let imgSrc = pickSrcFromElement(imgInCard)

    // 2. なければページ全体から代表的な商品画像っぽいものを探す
    if (!imgSrc) {
      const pageImg = $(
        ".product img, .product picture source, .product picture img, main img, main picture source, main picture img"
      ).first()
      imgSrc = pickSrcFromElement(pageImg)
    }

    if (imgSrc) {
      try {
        image_url = new URL(imgSrc, baseUrl).toString()
      } catch {
        image_url = imgSrc
      }
    }

    const price_per_kg =
      priceInfo.price_yen && unitInfo.unit_kg
        ? Math.round((priceInfo.price_yen / unitInfo.unit_kg) * 10) / 10
        : null

    candidates.push({
      manufacturer_name: manufacturerName,
      manufacturer_code: manufacturerCode,
      product_name,
      flavor,
      unit_text: unitInfo.unit_text,
      unit_kg: unitInfo.unit_kg,
      price_text: priceInfo.price_text,
      price_yen: priceInfo.price_yen,
      price_per_kg,
      image_url,
      source_url,
      raw_product_name: product_name,
      raw_flavor: flavor,
      raw_unit_text: unitInfo.unit_text,
      raw_price_text: priceInfo.price_text
    })
  })

  const unique = new Map<string, ParsedProduct>()
  for (const p of candidates) {
    const key = buildUpsertKey(p)
    if (!unique.has(key)) unique.set(key, p)
  }

  return Array.from(unique.values()).slice(0, 200)
}

// MyProtein 専用パーサー
// - manufacturer_sources.manufacturer_code = 'myprotein' を想定
// - 商品詳細ページ構造（product-title / Amount ボタン / product-price / gallery-image）に対応
function parseMyproteinPage(html: string, src: ManufacturerSource): ParsedProduct[] {
  const $ = load(html)
  const candidates: ParsedProduct[] = []

  // 商品詳細ページ: #product-title がある前提
  const productTitle = $("#product-title")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim()

  if (!productTitle) {
    return []
  }

  const raw_product_name = productTitle

  // フレーバー:
  // 1. フレーバー用セレクトボックスで selected な option のテキスト
  // 2. なければ商品名テキストからキーワード抽出
  const selectedFlavorOption = $("select.elements-variations-dropdown option[selected]")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim()
  const flavorFromSelect = selectedFlavorOption || null
  const flavorFromText = extractFlavorFromText(raw_product_name)
  const flavor = flavorFromSelect || flavorFromText || null

  // 容量: Amount バリエーションボタンのうち aria-checked="true" のもの
  const amountBtn = $('button[data-option="Amount"][aria-checked="true"]').first()
  const amountText =
    amountBtn.find(".elements-variations-button-content").first().text().trim() ||
    amountBtn.attr("data-key") ||
    ""

  const unitSourceText = amountText || ""
  const unitInfo = parseUnit(unitSourceText)

  // 価格:
  // 1. PC 向け: #product-price 内の .price / .price-per
  // 2. SP 向け: #product-price-secondary 内の .price
  // 3. サブスクリプションタブの #onetime-price
  const priceBlock = $("#product-price")
  const priceMainText = priceBlock
    .find(".price")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim()
  const pricePerText = priceBlock
    .find(".price-per")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim()

  const priceSecondaryBlock = $("#product-price-secondary")
  const priceSecondaryText = priceSecondaryBlock
    .find(".price")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim()

  const oneTimePriceText = $("#onetime-price")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim()

  const priceSourceText =
    priceMainText || pricePerText || priceSecondaryText || oneTimePriceText || ""
  const priceInfo = parsePrice(priceSourceText)

  // 画像: ギャラリー画像（class="gallery-image"）を優先
  let image_url: string | null = null
  const imgSrcAttr = $("img.gallery-image").first().attr("src")
  if (imgSrcAttr) {
    try {
      image_url = new URL(imgSrcAttr, src.url).toString()
    } catch {
      image_url = imgSrcAttr
    }
  }

  const price_per_kg =
    priceInfo.price_yen && unitInfo.unit_kg
      ? Math.round((priceInfo.price_yen / unitInfo.unit_kg) * 10) / 10
      : null

  candidates.push({
    manufacturer_name: src.manufacturer_name,
    manufacturer_code: src.manufacturer_code,
    product_name: raw_product_name,
    flavor,
    unit_text: unitInfo.unit_text,
    unit_kg: unitInfo.unit_kg,
    price_text: priceInfo.price_text,
    price_yen: priceInfo.price_yen,
    price_per_kg,
    image_url,
    source_url: src.url,
    raw_product_name,
    raw_flavor: flavorFromText ?? null,
    raw_unit_text: unitSourceText || null,
    raw_price_text: priceSourceText || null
  })

  return candidates
}

export async function POST() {
  const { data: sources, error } = await supabase
    .from("manufacturer_sources")
    .select("id, manufacturer_name, url, manufacturer_code")

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
      const code = (src.manufacturer_code ?? "").toLowerCase()
      let parsed: ParsedProduct[] = []

      if (code === "myprotein") {
        parsed = parseMyproteinPage(html, src)
      } else {
        parsed = parseManufacturerPage(
          html,
          src.url,
          src.manufacturer_name,
          src.manufacturer_code
        )
        // 一覧カードだけでは曖昧な商品について、詳細ページを見てからプロテイン判定を強化する
        if (parsed.length > 0) {
          parsed = await filterProductsUsingDetailPages(parsed)
        }
      }

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

  // 詳細ページからの画像補完（image_url が欠けているものだけを対象にする）
  await enrichImagesFromDetailPages(allParsed)

  const rows = allParsed.map((p) => ({
    // 生テキストは専用カラムにも保存しておく
    manufacturer_name: p.manufacturer_name,
    manufacturer_code: p.manufacturer_code ?? null,
    product_name: p.product_name,
    flavor: p.flavor,
    unit_text: p.unit_text,
    unit_kg: p.unit_kg,
    price_text: p.price_text,
    price_yen: p.price_yen,
    price_per_kg: p.price_per_kg,
    image_url: p.image_url,
    source_url: p.source_url,
    raw_product_name: p.raw_product_name ?? p.product_name,
    raw_flavor: p.raw_flavor ?? p.flavor,
    raw_unit_text: p.raw_unit_text ?? p.unit_text,
    raw_price_text: p.raw_price_text ?? p.price_text,
    upsert_key: buildUpsertKey(p)
  }))

  // 同一 upsert_key が複数回含まれていると
  // 「ON CONFLICT DO UPDATE command cannot affect row a second time」になるため
  // ここで事前に upsert_key ごとに 1 レコードにまとめる
  const uniqueRows = Array.from(
    new Map(rows.map((r) => [r.upsert_key, r])).values()
  )

  const { error: upsertError } = await supabase
    .from("manufacturer_products")
    .upsert(uniqueRows, { onConflict: "upsert_key" })

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
          total_products: uniqueRows.length,
      manufacturers: Array.from(
        new Set(uniqueRows.map((p) => p.manufacturer_name))
      ).length
    },
    { status: 200 }
  )
}


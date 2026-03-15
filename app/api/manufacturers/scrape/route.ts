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
  // 栄養（manufacturer_products に migration でカラムがある場合に保存）
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  nutrition_raw_text?: string | null
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
  // パターン例: ¥1,980 / 1,980円 / 税込1,980円 / 11000（税込）※全角括弧
  const patterns = [
    /[¥￥]\s*([\d,]+)/,
    /([\d,]+)\s*円\s*[（(]?税込[）)]?/,
    /([\d,]+)\s*[（(]税込[）)]/,
    /([\d,]+)\s*円/
  ]
  for (const re of patterns) {
    const match = text.match(re)
    if (match) {
      const raw = (match[1] ?? "").replace(/,/g, "")
      const numeric = Number(raw)
      if (Number.isFinite(numeric)) return { price_text: match[0], price_yen: numeric }
    }
  }
  return { price_text: null, price_yen: null }
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
  // - フレーバー用セレクトボックスの全 option から、プレースホルダを除いた一覧を取得
  // - なければ商品名テキストからキーワード抽出し、単一フレーバーとして扱う
  const allFlavorOptions = $(
    "select.elements-variations-dropdown option"
  )
    .map((_, el) =>
      $(el)
        .text()
        .replace(/\s+/g, " ")
        .trim()
    )
    .get()
    .filter((text: string) => {
      if (!text) return false
      // 「フレーバーを選択」「お選びください」などのプレースホルダを除外
      const lower = text.toLowerCase()
      if (
        /select|choose|選択|お選びください/.test(lower) ||
        text === "-"
      ) {
        return false
      }
      return true
    })

  const flavorFromText = extractFlavorFromText(raw_product_name)

  // フレーバー候補リスト（プルダウンがあればその全件、なければテキスト由来の 1 件）
  const flavorCandidates: (string | null)[] =
    allFlavorOptions.length > 0
      ? Array.from(new Set(allFlavorOptions))
      : flavorFromText
      ? [flavorFromText]
      : [null]

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

  // フレーバーごとに 1 レコードずつ展開して登録する
  for (const flavor of flavorCandidates) {
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
      raw_flavor: flavor ?? flavorFromText ?? null,
      raw_unit_text: unitSourceText || null,
      raw_price_text: priceSourceText || null
    })
  }

  return candidates
}

// 同一オリジンで商品詳細っぽい a[href] を HTML から収集（一覧・AJAX レスポンス共通）
function collectProductLinksFromHtml(html: string, listPageUrl: string, base: URL): Set<string> {
  const $ = load(html)
  const seen = new Set<string>()
  const addLink = (href: string) => {
    if (!href || href.startsWith("#")) return
    try {
      const url = new URL(href, listPageUrl)
      if (url.origin !== base.origin) return
      const path = url.pathname.replace(/\/$/, "")
      if (!path || path === "/" || path === "/product_protein") return
      if (/\/cart\/|\/checkout\/|\/mypage\/|\.(pdf|jpg|png)$/i.test(path)) return
      seen.add(url.toString())
    } catch {
      /* ignore */
    }
  }
  $("a[href]").each((_, el) => {
    addLink($(el).attr("href") ?? "")
  })
  return seen
}

// MY ROUTINE 一覧ページの「もっと見る」用: admin-ajax.php のパラメータを HTML から推測
// .entry-more の data-* やインラインスクリプト内の action / nonce を探す
function extractMyroutineAjaxParams(html: string): { action: string; nonce: string; catid: string } | null {
  const $ = load(html)
  const entryMore = $(".entry-more").first()
  const action =
    entryMore.attr("data-action") ??
    entryMore.attr("data-ajax-action") ??
    ""
  const nonce =
    entryMore.attr("data-nonce") ??
    entryMore.attr("data-security") ??
    ""
  const catid = entryMore.attr("data-catid") ?? ""

  if (!action) {
    const scriptText = $("script").toArray().map((el) => $(el).html() ?? "").join(" ")
    const actionMatch = scriptText.match(/action\s*[:=]\s*['"]([^'"]+)['"]/) ?? scriptText.match(/['"](load_more|ajax_load_more|get_posts)['"]/)
    const nonceMatch = scriptText.match(/nonce\s*[:=]\s*['"]([^'"]+)['"]/) ?? scriptText.match(/security\s*[:=]\s*['"]([^'"]+)['"]/)
    const foundAction = actionMatch ? (actionMatch[1] ?? "") : ""
    const foundNonce = nonceMatch ? (nonceMatch[1] ?? "") : ""
    if (foundAction) {
      return { action: foundAction, nonce: foundNonce, catid }
    }
    return null
  }
  return { action, nonce, catid }
}

// MY ROUTINE「もっと見る」: admin-ajax.php に offset を渡して追加 HTML を取得
// 実サイトの Payload: action=get_gellery_items, offset_post_num=36, post_cat_id=
async function fetchMyroutineAjaxChunk(
  listPageUrl: string,
  offset: number,
  params: { action: string; nonce: string; catid: string }
): Promise<string> {
  const base = new URL(listPageUrl)
  const ajaxUrl = `${base.origin}/wp-admin/admin-ajax.php`
  const body = new URLSearchParams()
  body.set("action", params.action)
  body.set("offset_post_num", String(offset))
  body.set("post_cat_id", params.catid ?? "")
  if (params.nonce) body.set("nonce", params.nonce)

  const res = await fetch(ajaxUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      Referer: listPageUrl
    },
    body: body.toString()
  })
  if (!res.ok) return ""
  const text = await res.text()
  // 実サイトは JSON { html: "..." } で返すため、html だけ取り出す
  try {
    const j = JSON.parse(text) as { html?: string }
    if (j && typeof j.html === "string") return j.html
  } catch {
    /* そのまま text を HTML として使う */
  }
  return text
}

// 商品詳細ページの URL かどうか（/product_protein/スラッグ/ 形式のみ。concept, brand 等は除外）
function isMyroutineProductDetailUrl(path: string): boolean {
  const m = path.match(/^\/product_protein\/([^/]+)\/?$/)
  return !!m && m[1].length > 0
}

// MY ROUTINE 一覧ページから商品詳細URLを抽出（初期HTML + admin-ajax で「もっと見る」分も取得）
// - 実サイト: action=get_gellery_items, offset_post_num=36,72,... post_cat_id= で admin-ajax.php を叩く
// - AJAX は JSON { html: "..." } で返るため fetchMyroutineAjaxChunk で html を抽出してからパース
async function parseMyroutineListPage(html: string, listPageUrl: string): Promise<string[]> {
  const base = new URL(listPageUrl)
  const seen = collectProductLinksFromHtml(html, listPageUrl, base)
  const productOnly = new Set<string>()
  seen.forEach((u) => {
    try {
      const path = new URL(u).pathname.replace(/\/$/, "") || "/"
      if (isMyroutineProductDetailUrl(path)) productOnly.add(u)
    } catch {
      /* ignore */
    }
  })

  let params = extractMyroutineAjaxParams(html)
  if (!params?.action && /myroutine\.jp/i.test(listPageUrl)) {
    params = { action: "get_gellery_items", nonce: "", catid: "" }
  }
  if (params?.action) {
    const OFFSET_STEP = 36
    const MAX_CHUNKS = 15
    for (let chunk = 1; chunk <= MAX_CHUNKS; chunk++) {
      const offset = chunk * OFFSET_STEP
      const chunkHtml = await fetchMyroutineAjaxChunk(listPageUrl, offset, params)
      if (!chunkHtml || chunkHtml.trim().length < 50) break
      const before = productOnly.size
      const chunkLinks = collectProductLinksFromHtml(chunkHtml, listPageUrl, base)
      chunkLinks.forEach((u) => {
        try {
          const path = new URL(u).pathname.replace(/\/$/, "") || "/"
          if (isMyroutineProductDetailUrl(path)) productOnly.add(u)
        } catch {
          /* ignore */
        }
      })
      if (productOnly.size === before) break
      await sleep(randomDelay())
    }
  }

  return Array.from(productOnly)
}

// MY ROUTINE サイトの価格: 通常購入は .price1 + .price2（例: <span class="price1">11,000</span><span class="price2">円(税込)</span>）
// :has() は Cheerio で未対応のため「通常購入」を含むブロックを手動で特定する
function extractMyroutinePriceText($: ReturnType<typeof load>, html: string): string {
  // 「通常購入」を含む要素のうち .price1 を持つブロックを探す（LINE UP の価格より先に取る）
  const blocks = $("p, div, section").filter((_, el) => {
    const text = $(el).text()
    return /通常購入/.test(text) && $(el).find(".price1").length > 0
  })
  if (blocks.length > 0) {
    const block = blocks.first()
    const p1 = block.find(".price1").first().text().replace(/\s+/g, " ").trim()
    const p2 = block.find(".price2").first().text().replace(/\s+/g, " ").trim()
    if (p1) return p2 ? `${p1}${p2}`.trim() : `${p1}円(税込)`
  }
  // フォールバック: 文書順で最初の .price1 + .price2
  const price1 = $(".price1").first().text().replace(/\s+/g, " ").trim()
  const price2 = $(".price2").first().text().replace(/\s+/g, " ").trim()
  if (price1 && price2) return `${price1}${price2}`.trim()
  if (price1) return `${price1}円(税込)`
  // HTML から <span class="price1">11,000</span> を直接探す
  const price1Tag = html.match(/<span\s+class="price1"[^>]*>([\d,]+)<\/span>/i)
  if (price1Tag) return `${price1Tag[1]}円(税込)`
  const bottomArea = $(".bottom_area .price").first().text().replace(/\s+/g, " ").trim()
  if (bottomArea) return bottomArea

  // 正規表現フォールバック: 通常購入ブロック付近の価格（全角括弧も許容）
  const normalPriceMatch = html.match(/通常購入[\s\S]*?([\d,]+)\s*[円]?\s*[（(]税込[）)]/i)
  if (normalPriceMatch) return `${normalPriceMatch[1]}円(税込)`
  const anyYen = html.match(/([\d,]+)\s*円\s*[（(]税込[）)]/)
  if (anyYen) return `${anyYen[1]}円(税込)`
  const yenMatch = html.match(/[¥￥]\s*([\d,]+)/)
  if (yenMatch) return `${yenMatch[1]}円`
  return ""
}

// 栄養成分表示ブロックから数値を抽出（g は半角・全角どちらも許容）
// details > .answer 内の「エネルギー142kcal、たんぱく質26.6ｇ...」を対象にする
function parseMyroutineNutrition(html: string, detailsAnswerText?: string): {
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  nutrition_raw_text: string | null
} {
  const text = (detailsAnswerText ?? html).replace(/\s+/g, " ").trim()
  const caloriesMatch = text.match(/エネルギー\s*([\d.]+)\s*kcal/i)
  const proteinMatch = text.match(/たんぱく質\s*([\d.]+)\s*[gｇ]/i)
  const fatMatch = text.match(/脂質\s*([\d.]+)\s*[gｇ]/i)
  const carbsMatch = text.match(/炭水化物\s*([\d.]+)\s*[gｇ]/i)
  const nutritionBlock = text.match(/栄養成分表示[\s\S]*?(?=原材料|取り扱い|$)/i)?.[0] ?? (detailsAnswerText ? text.slice(0, 500) : null)
  return {
    calories: caloriesMatch ? Number(caloriesMatch[1]) : null,
    protein_g: proteinMatch ? Number(proteinMatch[1]) : null,
    fat_g: fatMatch ? Number(fatMatch[1]) : null,
    carbs_g: carbsMatch ? Number(carbsMatch[1]) : null,
    nutrition_raw_text: nutritionBlock
  }
}

// MY ROUTINE 専用パーサー（1商品の詳細ページ用）
// - manufacturer_sources.manufacturer_code = 'myroutine' を想定
// - 価格: 通常購入は .price1 + .price2、なければ .bottom_area .price
// - 栄養: 栄養成分表示ブロックから正規表現で抽出
function parseMyroutinePage(html: string, src: ManufacturerSource): ParsedProduct[] {
  const $ = load(html)
  const candidates: ParsedProduct[] = []

  // タイトル（h1 または .product_title 相当）を取得
  const titleText =
    $("h1")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim() ||
    $(".product_title, .title")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim()

  if (!titleText) {
    return []
  }

  const raw_product_name = titleText

  // フレーバーはタイトルから推定（ストロベリーなど）
  const flavorFromText = extractFlavorFromText(raw_product_name)

  // 容量はタイトル内の「1050g」などから推定
  const unitInfo = parseUnit(raw_product_name)

  // 価格: 通常購入 .price1 + .price2 を優先、なければ .bottom_area .price、さらに HTML 正規表現フォールバック
  const priceBlockText = extractMyroutinePriceText($, html)
  const priceInfo = parsePrice(priceBlockText)

  // 栄養: details > summary「栄養成分表示」内の .answer を優先（クリックしなくても DOM にはある）
  let nutritionDetailsText: string | undefined
  $(".specArea details, details").each((_, el) => {
    const summary = $(el).find("summary").text().replace(/\s+/g, " ").trim()
    if (/栄養成分/.test(summary)) {
      nutritionDetailsText = $(el).find(".answer").text().replace(/\s+/g, " ").trim()
      return false
    }
  })
  const nutrition = parseMyroutineNutrition(html, nutritionDetailsText)

  // 画像は og:image を優先し、なければページ内の代表画像を探す
  let image_url: string | null = null
  const ogImg =
    $('meta[property="og:image"]').attr("content") ??
    $('meta[name="og:image"]').attr("content") ??
    ""

  if (ogImg) {
    try {
      image_url = new URL(ogImg, src.url).toString()
    } catch {
      image_url = ogImg
    }
  } else {
    const imgEl = $("main img, .product img, img").first()
    const imgSrc =
      imgEl.attr("data-src") ??
      imgEl.attr("data-original") ??
      imgEl.attr("src") ??
      ""
    if (imgSrc) {
      try {
        image_url = new URL(imgSrc, src.url).toString()
      } catch {
        image_url = imgSrc
      }
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
    flavor: flavorFromText,
    unit_text: unitInfo.unit_text,
    unit_kg: unitInfo.unit_kg,
    price_text: priceInfo.price_text,
    price_yen: priceInfo.price_yen,
    price_per_kg,
    image_url,
    source_url: src.url,
    raw_product_name,
    raw_flavor: flavorFromText ?? null,
    raw_unit_text: unitInfo.unit_text ?? null,
    raw_price_text: priceBlockText || null,
    calories: nutrition.calories,
    protein_g: nutrition.protein_g,
    carbs_g: nutrition.carbs_g,
    fat_g: nutrition.fat_g,
    nutrition_raw_text: nutrition.nutrition_raw_text
  })

  return candidates
}

async function runImportAndClassify(origin: string): Promise<{ importOk: boolean; classifyOk: boolean }> {
  let importOk = false
  let classifyOk = false
  try {
    const importRes = await fetch(`${origin}/api/source-texts/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: ["manufacturer"] })
    })
    importOk = importRes.ok
    if (!importRes.ok) {
      console.error("Import after scrape failed", await importRes.text())
    }
  } catch (e) {
    console.error("Import after scrape failed", e)
  }
  try {
    const classifyRes = await fetch(`${origin}/api/batch/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 150 })
    })
    classifyOk = classifyRes.ok
    if (!classifyRes.ok) {
      console.error("Classify after scrape failed", await classifyRes.text())
    }
  } catch (e) {
    console.error("Classify after scrape failed", e)
  }
  return { importOk, classifyOk }
}

export async function POST(req: Request) {
  let body: {
    manufacturer_code?: string
    manufacturer_name?: string
    product_url?: string
  } = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text) as typeof body
  } catch {
    /* body なし or 不正 JSON は無視 */
  }

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

  // 1商品だけ指定して更新（メーカー＋商品URLでその1件だけ新ロジックで取得・upsert）
  if (body.product_url?.trim()) {
    const productUrl = body.product_url.trim()
    let productOrigin: string
    try {
      productOrigin = new URL(productUrl).origin
    } catch {
      return NextResponse.json(
        { error: "product_url が不正です。", product_url: productUrl },
        { status: 400 }
      )
    }

    const normalizeForMatch = (v: string) =>
      v.toLowerCase().replace(/\s+/g, "")
    let candidateSources = (sources as ManufacturerSource[]).filter(
      (s) => new URL(s.url).origin === productOrigin
    )
    if (body.manufacturer_code?.trim()) {
      const code = body.manufacturer_code.trim().toLowerCase()
      candidateSources = candidateSources.filter(
        (s) =>
          (s.manufacturer_code ?? "").toLowerCase() === code ||
          normalizeForMatch(s.manufacturer_name ?? "") === code
      )
    } else if (body.manufacturer_name?.trim()) {
      const name = body.manufacturer_name.trim()
      candidateSources = candidateSources.filter(
        (s) =>
          (s.manufacturer_name ?? "").includes(name) ||
          (s.manufacturer_name ?? "").toLowerCase() === name.toLowerCase()
      )
    }

    if (candidateSources.length === 0) {
      return NextResponse.json(
        {
          error: "指定した product_url に一致するメーカー登録がありません。",
          product_url: productUrl,
          hint: "manufacturer_name または manufacturer_code を指定してください。"
        },
        { status: 400 }
      )
    }
    const src = candidateSources[0] as ManufacturerSource

    const res = await fetch(productUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
      }
    })
    if (!res.ok) {
      return NextResponse.json(
        {
          error: "商品ページの取得に失敗しました。",
          product_url: productUrl,
          status: res.status
        },
        { status: 502 }
      )
    }
    const html = await res.text()
    const code = (src.manufacturer_code ?? "").toLowerCase()
    let parsed: ParsedProduct[] = []

    if (code === "myprotein") {
      parsed = parseMyproteinPage(html, { ...src, url: productUrl })
    } else if (
      code === "myroutine" ||
      /myroutine\.jp/i.test(productUrl)
    ) {
      parsed = parseMyroutinePage(html, { ...src, url: productUrl })
    } else {
      parsed = parseManufacturerPage(
        html,
        productUrl,
        src.manufacturer_name,
        src.manufacturer_code
      )
    }

    if (parsed.length === 0) {
      return NextResponse.json(
        {
          error: "指定URLから商品情報を抽出できませんでした。",
          product_url: productUrl
        },
        { status: 200 }
      )
    }

    const rows = parsed.map((p) => ({
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
      upsert_key: buildUpsertKey(p),
      ...(p.calories != null && { calories: p.calories }),
      ...(p.protein_g != null && { protein_g: p.protein_g }),
      ...(p.carbs_g != null && { carbs_g: p.carbs_g }),
      ...(p.fat_g != null && { fat_g: p.fat_g }),
      ...(p.nutrition_raw_text != null && { nutrition_raw_text: p.nutrition_raw_text })
    }))
    const uniqueRows = Array.from(
      new Map(rows.map((r) => [r.upsert_key, r])).values()
    )

    const { error: upsertError } = await supabase
      .from("manufacturer_products")
      .upsert(uniqueRows, { onConflict: "upsert_key" })

    if (upsertError) {
      console.error(upsertError)
      return NextResponse.json(
        {
          error: "manufacturer_products への保存に失敗しました。",
          details: upsertError.message
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: "1商品を更新しました。",
      mode: "single_product",
      product_url: productUrl,
      manufacturer_name: src.manufacturer_name,
      total_products: uniqueRows.length,
      product_name: uniqueRows[0]?.product_name ?? null,
      price_yen: uniqueRows[0]?.price_yen ?? null,
      note: "一覧反映は手動で import と classify を実行するか、全体スクレイプ後に自動実行されます。"
    })
  }

  const normalizeForMatch = (v: string) =>
    v.toLowerCase().replace(/\s+/g, "")

  let filtered = sources as ManufacturerSource[]
  if (body.manufacturer_code?.trim()) {
    const code = body.manufacturer_code.trim().toLowerCase()
    filtered = filtered.filter((s) => {
      const dbCode = (s.manufacturer_code ?? "").toLowerCase()
      const dbNameNorm = normalizeForMatch(s.manufacturer_name ?? "")
      return dbCode === code || dbNameNorm === code || dbNameNorm.includes(code)
    })
  } else if (body.manufacturer_name?.trim()) {
    const name = body.manufacturer_name.trim()
    filtered = filtered.filter(
      (s) =>
        (s.manufacturer_name ?? "").includes(name) ||
        (s.manufacturer_name ?? "").toLowerCase() === name.toLowerCase()
    )
  }

  if (filtered.length === 0) {
    const hint = body.manufacturer_code
      ? `manufacturer_code="${body.manufacturer_code}"`
      : body.manufacturer_name
        ? `manufacturer_name="${body.manufacturer_name}"`
        : ""
    return NextResponse.json(
      {
        message: "指定したメーカーに一致する登録がありません。",
        hint: hint ? `指定: ${hint}` : null,
        registered_count: sources.length
      },
      { status: 200 }
    )
  }

  const allParsed: ParsedProduct[] = []

  for (const src of filtered) {
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
      } else if (
        code === "myroutine" ||
        (/myroutine\.jp/i.test(src.url) && /product_protein\/?$/i.test(new URL(src.url).pathname.replace(/\/$/, "")))
      ) {
        const isListPage = /product_protein\/?$/i.test(new URL(src.url).pathname.replace(/\/$/, ""))
        if (isListPage) {
          const detailUrls = await parseMyroutineListPage(html, src.url)
          const MAX_DETAIL = 80
          for (let i = 0; i < Math.min(detailUrls.length, MAX_DETAIL); i++) {
            try {
              const res = await fetch(detailUrls[i], {
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
                }
              })
              if (!res.ok) continue
              const detailHtml = await res.text()
              const one = parseMyroutinePage(detailHtml, {
                ...src,
                url: detailUrls[i]
              })
              if (one.length > 0) parsed.push(...one)
              await sleep(randomDelay())
            } catch (e) {
              console.error(`myroutine detail fetch failed: ${detailUrls[i]}`, e)
            }
          }
        } else {
          parsed = parseMyroutinePage(html, src)
        }
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
    upsert_key: buildUpsertKey(p),
    ...(p.calories != null && { calories: p.calories }),
    ...(p.protein_g != null && { protein_g: p.protein_g }),
    ...(p.carbs_g != null && { carbs_g: p.carbs_g }),
    ...(p.fat_g != null && { fat_g: p.fat_g }),
    ...(p.nutrition_raw_text != null && { nutrition_raw_text: p.nutrition_raw_text })
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
      const origin = new URL(req.url).origin
      const refresh = await runImportAndClassify(origin)
      return NextResponse.json(
        {
          message:
            "manufacturer_products に保存しました。upsert 用のカラム（upsert_key）がないため insert で実行しています。上書き・新着判定を使う場合はマイグレーションを実行してください。",
          total_products: allParsed.length,
          manufacturers: Array.from(
            new Set(allParsed.map((p) => p.manufacturer_name))
          ).length,
          ...(refresh.importOk && refresh.classifyOk
            ? { reflected: true, note: "一覧反映用の取り込み・分類も実行済みです。画面を再読み込みしてください。" }
            : { reflected: false, note: "一覧反映は手動で npm run batch:import-and-classify を実行してください。" })
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

  const origin = new URL(req.url).origin
  const refresh = await runImportAndClassify(origin)

  return NextResponse.json(
    {
      message:
        "メーカーサイトからの商品情報を保存しました。同一キーは価格など上書き、新規は first_seen_at で判別できます。",
      total_products: uniqueRows.length,
      manufacturers: Array.from(
        new Set(uniqueRows.map((p) => p.manufacturer_name))
      ).length,
      ...(refresh.importOk && refresh.classifyOk
        ? { reflected: true, note: "一覧反映用の取り込み・分類も実行済みです。画面を再読み込みしてください。" }
        : { reflected: false, note: "一覧反映は手動で npm run batch:import-and-classify を実行してください。" })
    },
    { status: 200 }
  )
}


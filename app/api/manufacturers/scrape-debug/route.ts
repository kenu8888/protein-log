import { NextResponse } from "next/server"
import { load } from "cheerio"
import { supabase } from "../../../../lib/supabase"

// 価格テキストから数値を取り出す（scrape と同一ロジック）
function parsePrice(text: string): { price_text: string | null; price_yen: number | null } {
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

// MY ROUTINE 価格抽出（scrape と同一ロジック・:has を使わない版）
function extractMyroutinePriceText($: ReturnType<typeof load>, html: string): string {
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
  const price1 = $(".price1").first().text().replace(/\s+/g, " ").trim()
  const price2 = $(".price2").first().text().replace(/\s+/g, " ").trim()
  if (price1 && price2) return `${price1}${price2}`.trim()
  if (price1) return `${price1}円(税込)`
  const price1Tag = html.match(/<span\s+class="price1"[^>]*>([\d,]+)<\/span>/i)
  if (price1Tag) return `${price1Tag[1]}円(税込)`
  const bottomArea = $(".bottom_area .price").first().text().replace(/\s+/g, " ").trim()
  if (bottomArea) return bottomArea
  const normalPriceMatch = html.match(/通常購入[\s\S]*?([\d,]+)\s*[円]?\s*[（(]税込[）)]/i)
  if (normalPriceMatch) return `${normalPriceMatch[1]}円(税込)`
  const anyYen = html.match(/([\d,]+)\s*円\s*[（(]税込[）)]/)
  if (anyYen) return `${anyYen[1]}円(税込)`
  const yenMatch = html.match(/[¥￥]\s*([\d,]+)/)
  if (yenMatch) return `${yenMatch[1]}円`
  return ""
}

/**
 * MY ROUTINE 取得がどこで失敗しているか調査するためのデバッグ用 API。
 * GET または POST で呼ぶと、manufacturer_sources の myroutine を対象に
 * 一覧ページ取得 → リンク数 → admin-ajax → 詳細ページの h1/.bottom_area を確認し、
 * 結果を JSON で返す。
 * ?product_url=https://www.myroutine.jp/product_protein/h01-myroutinemaxstr-3000 を付けると、
 * そのURLを fetch して価格・栄養のパース結果と HTML スニペットを返す（原因調査用）。
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const productUrl = searchParams.get("product_url")?.trim()
  if (productUrl) return runProductUrlDiagnostic(productUrl)
  return runDiagnostic()
}

export async function POST(req: Request) {
  let body: { product_url?: string } = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text) as typeof body
  } catch {
    /* ignore */
  }
  if (body.product_url?.trim()) return runProductUrlDiagnostic(body.product_url.trim())
  return runDiagnostic()
}

async function runProductUrlDiagnostic(productUrl: string) {
  let html: string
  try {
    const res = await fetch(productUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
      }
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: "fetch failed", url: productUrl, status: res.status },
        { status: 200 }
      )
    }
    html = await res.text()
  } catch (e) {
    return NextResponse.json({ error: "fetch error", url: productUrl, message: String(e) }, { status: 200 })
  }

  const $ = load(html)
  const priceBlockText = extractMyroutinePriceText($, html)
  const priceInfo = parsePrice(priceBlockText)

  let nutritionDetailsText: string | undefined
  $(".specArea details, details").each((_, el) => {
    const summary = $(el).find("summary").text().replace(/\s+/g, " ").trim()
    if (/栄養成分/.test(summary)) {
      nutritionDetailsText = $(el).find(".answer").text().replace(/\s+/g, " ").trim()
      return false
    }
  })
  const textForNutrition = (nutritionDetailsText ?? html).replace(/\s+/g, " ").trim()
  const caloriesMatch = textForNutrition.match(/エネルギー\s*([\d.]+)\s*kcal/i)
  const proteinMatch = textForNutrition.match(/たんぱく質\s*([\d.]+)\s*[gｇ]/i)

  const idxPrice = html.indexOf("price1")
  const htmlSnippet =
    idxPrice >= 0 ? html.slice(Math.max(0, idxPrice - 200), idxPrice + 400) : html.slice(0, 1500)

  return NextResponse.json({
    message: "指定URLの取得・パース結果です。",
    url: productUrl,
    html_length: html.length,
    price: {
      extracted_text: priceBlockText,
      parse_result: priceInfo,
      note: !priceBlockText ? "価格テキストが抽出できていません。HTML スニペットで構造を確認してください。" : null
    },
    nutrition: {
      details_block_found: !!nutritionDetailsText,
      details_block_preview: nutritionDetailsText?.slice(0, 200) ?? null,
      calories: caloriesMatch ? Number(caloriesMatch[1]) : null,
      protein_g: proteinMatch ? Number(proteinMatch[1]) : null
    },
    html_snippet_around_price: htmlSnippet
  })
}

async function runDiagnostic() {
  const baseUrl = "https://www.myroutine.jp"
  const listPageUrl = `${baseUrl}/product_protein/`
  const base = new URL(listPageUrl)

  const steps: Record<string, unknown> = {}

  // 1) manufacturer_sources に myroutine が登録されているか
  const { data: sources, error: srcError } = await supabase
    .from("manufacturer_sources")
    .select("id, manufacturer_name, url, manufacturer_code")

  if (srcError) {
    return NextResponse.json({ error: "manufacturer_sources 取得失敗", details: srcError.message }, { status: 500 })
  }

  const myroutine = (sources ?? []).find(
    (s: { manufacturer_code?: string }) => (s.manufacturer_code ?? "").toLowerCase() === "myroutine"
  )
  const myroutineByUrl = (sources ?? []).find(
    (s: { url?: string }) => (s.url ?? "").includes("myroutine.jp") && (s.url ?? "").includes("product_protein")
  )
  steps.manufacturer_sources = {
    total: (sources ?? []).length,
    myroutine_found: !!myroutine,
    myroutine_url: myroutine?.url ?? null,
    myroutine_name: myroutine?.manufacturer_name ?? null,
    note: !myroutine && !myroutineByUrl
      ? "manufacturer_sources に MY ROUTINE の一覧URLがありません。url=https://www.myroutine.jp/product_protein/ かつ manufacturer_code=myroutine の行を追加してください。"
      : !myroutine && myroutineByUrl
        ? "一覧URLは登録済みですが manufacturer_code が 'myroutine'（小文字）でない可能性があります。スクレイプは URL 一致で動きます。"
        : null
  }

  // 2) 一覧ページを fetch
  let listHtml: string
  try {
    const res = await fetch(listPageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
      }
    })
    steps.list_page_fetch = { ok: res.ok, status: res.status, url: listPageUrl }
    if (!res.ok) {
      return NextResponse.json({ message: "一覧ページの取得に失敗しました。", steps }, { status: 200 })
    }
    listHtml = await res.text()
    steps.list_page_length = listHtml.length
  } catch (e) {
    steps.list_page_fetch = { error: String(e) }
    return NextResponse.json({ message: "一覧ページの fetch で例外。", steps }, { status: 200 })
  }

  // 3) 初期 HTML から商品リンクを収集（collectProductLinksFromHtml と同じロジック）
  const seen = new Set<string>()
  const $ = load(listHtml)
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
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
  })
  steps.initial_link_count = seen.size
  const productLinks = Array.from(seen).filter((u) => {
    try {
      const path = new URL(u).pathname.replace(/\/$/, "") || "/"
      return /^\/product_protein\/[^/]+\/?$/.test(path)
    } catch {
      return false
    }
  })
  steps.product_detail_link_count = productLinks.length
  steps.sample_links = productLinks.slice(0, 5)

  // 4) admin-ajax パラメータ（.entry-more の data-* またはフォールバック）
  const entryMore = $(".entry-more").first()
  const action =
    entryMore.attr("data-action") ?? entryMore.attr("data-ajax-action") ?? ""
  const nonce = entryMore.attr("data-nonce") ?? entryMore.attr("data-security") ?? ""
  const catid = entryMore.attr("data-catid") ?? ""
  const ajaxParams = action
    ? { action, nonce, catid }
    : { action: "get_gellery_items", nonce: "", catid: "" }
  steps.ajax_params = ajaxParams

  // 5) admin-ajax を 1 回だけ叩く（offset=36）
  const ajaxUrl = `${base.origin}/wp-admin/admin-ajax.php`
  const body = new URLSearchParams()
  body.set("action", ajaxParams.action)
  body.set("offset_post_num", "36")
  body.set("post_cat_id", ajaxParams.catid ?? "")
  if (ajaxParams.nonce) body.set("nonce", ajaxParams.nonce)

  let ajaxHtml = ""
  try {
    const ajaxRes = await fetch(ajaxUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Referer: listPageUrl
      },
      body: body.toString()
    })
    steps.ajax_fetch = { ok: ajaxRes.ok, status: ajaxRes.status }
    ajaxHtml = await ajaxRes.text()
    steps.ajax_response_length = ajaxHtml.length
    steps.ajax_response_preview = ajaxHtml.slice(0, 300)
  } catch (e) {
    steps.ajax_fetch = { error: String(e) }
  }

  if (ajaxHtml) {
    let chunkHtml = ajaxHtml
    try {
      const parsed = JSON.parse(ajaxHtml) as { html?: string }
      if (typeof parsed?.html === "string") chunkHtml = parsed.html
    } catch {
      /* use raw as HTML */
    }
    const $ajax = load(chunkHtml)
    const chunkLinks = new Set<string>()
    $ajax("a[href]").each((_, el) => {
      const href = $ajax(el).attr("href")
      if (!href || href.startsWith("#")) return
      try {
        const url = new URL(href, listPageUrl)
        if (url.origin !== base.origin) return
        const path = url.pathname.replace(/\/$/, "")
        if (!path || path === "/" || path === "/product_protein") return
        if (/\/cart\/|\/checkout\/|\/mypage\/|\.(pdf|jpg|png)$/i.test(path)) return
        chunkLinks.add(url.toString())
      } catch {
        /* ignore */
      }
    })
    steps.ajax_chunk_link_count = chunkLinks.size
    const productChunkLinks = Array.from(chunkLinks).filter((u) =>
      /^\/product_protein\/[^/]+\/?$/.test(new URL(u).pathname.replace(/\/$/, "") || "/")
    )
    steps.ajax_sample_links = productChunkLinks.slice(0, 3)
  }

  // 6) 1件目の商品詳細URLを取得して中身を確認（product_protein/xxx/ のみ）
  const firstDetailUrl = productLinks[0] ?? null
  steps.first_detail_url = firstDetailUrl

  if (firstDetailUrl) {
    try {
      const detailRes = await fetch(firstDetailUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        }
      })
      steps.detail_fetch = { ok: detailRes.ok, status: detailRes.status }
      const detailHtml = await detailRes.text()
      const $d = load(detailHtml)
      const h1Text = $d("h1").first().text().trim()
      const price1 = $d(".price1").first().text().trim()
      const price2 = $d(".price2").first().text().trim()
      const normalPriceText = price1 && price2 ? `${price1}${price2}` : ""
      const bottomAreaPrice = $d(".bottom_area .price").first().text().trim()
      steps.detail_page = {
        has_h1: !!h1Text,
        h1_preview: h1Text.slice(0, 60),
        has_price1_price2: !!(price1 && price2),
        normal_price_preview: normalPriceText.slice(0, 40),
        has_bottom_area_price: !!bottomAreaPrice,
        bottom_area_price_preview: bottomAreaPrice.slice(0, 40),
        has_nutrition_block: !!detailHtml.includes("栄養成分表示") && !!detailHtml.match(/エネルギー\s*[\d.]+?\s*kcal/i)
      }
    } catch (e) {
      steps.detail_fetch = { error: String(e) }
    }
  }

  return NextResponse.json({
    message: "MY ROUTINE 取得のデバッグ結果です。各 step を確認してください。",
    steps
  })
}

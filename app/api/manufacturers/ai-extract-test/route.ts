/**
 * メーカー（マイプロテイン）で AI 抽出の精度テスト用 API。
 * - manufacturer_products の source_url を最大 limit 件取得するか、
 *   またはマイプロテインTOP/カテゴリから商品リンクを収集して詳細ページを取得
 * - 各ページの HTML からテキストを抽出し POST /api/ai-extract-product で栄養・価格等を取得
 * - 既存の Cheerio パース結果と比較しやすい形で返す
 *
 * POST body: { manufacturer_code?: "myprotein", limit?: number, urls?: string[] }
 * - urls を渡した場合はそのURLを優先（最大 limit 件）。サイトがJS描画で一覧からリンクが取れない場合に手動で詳細URLを指定してテスト可能。
 */

import { NextResponse } from "next/server"
import { load } from "cheerio"
import { supabase } from "../../../../lib/supabase"

const DEFAULT_LIMIT = 20
const MAX_PAGE_TEXT_CHARS = 35000
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
/** 外部サイト（マイプロテイン）への fetch のタイムアウト。1件ハングすると全体が返らないため必須 */
const FETCH_PAGE_TIMEOUT_MS = 25_000
/** AI 抽出 API 1回あたりのタイムアウト */
const AI_CALL_TIMEOUT_MS = 90_000
/** 全体の最大実行時間（この時間を過ぎたら部分結果を返して終了）。20件×約2分で約40分を見込む */
const MAX_TOTAL_MS = 45 * 60 * 1000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
function randomDelay() {
  return 800 + Math.floor(Math.random() * 1200)
}

function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = FETCH_PAGE_TIMEOUT_MS, ...init } = options
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  return fetch(url, { ...init, signal: ac.signal }).finally(() => clearTimeout(t))
}

/** HTML から AI 用のページテキストを抽出（script/style 除去、空白正規化） */
function extractPageTextFromHtml(html: string, baseUrl: string): string {
  const $ = load(html)
  $("script, style, noscript").remove()
  const main =
    $("main").first().length > 0
      ? $("main").first()
      : $("#content, .product-detail, .product-details, [role=main]").first()
  const root = main.length > 0 ? main : $("body")
  let text = root.text().replace(/\s+/g, " ").trim()
  if (text.length < 500) {
    text = $("body").text().replace(/\s+/g, " ").trim()
  }
  const title = $("title").first().text().trim()
  const productTitle = $("#product-title").first().text().replace(/\s+/g, " ").trim()
  const parts: string[] = []
  if (title) parts.push(`【タイトル】\n${title}`)
  if (productTitle) parts.push(`【商品名】\n${productTitle}`)
  parts.push(text)
  const combined = parts.join("\n\n")
  return combined.length > MAX_PAGE_TEXT_CHARS
    ? combined.slice(0, MAX_PAGE_TEXT_CHARS) + "\n\n[以下省略]"
    : combined
}

/**
 * マイプロテインの商品詳細URLパターン: /p/カテゴリ/商品スラグ/数値ID/ または .../数値ID.html
 * カテゴリ一覧（/c/...）や /p/ で始まらないリンクは除外する。
 */
const MYPROTEIN_DETAIL_PATH = /^\/p\/[^/]+\/.+\/\d+(\/|\.html)?$/i

/** 同一オリジンでマイプロテイン商品詳細リンクのみ収集（/p/.../数値ID/ 形式に限定） */
function collectProductLikeLinks(html: string, baseUrl: string): string[] {
  const $ = load(html)
  const base = new URL(baseUrl)
  const seen = new Set<string>()
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return
    try {
      const url = new URL(href, baseUrl)
      if (url.origin !== base.origin) return
      const path = url.pathname.replace(/\/$/, "") || "/"
      if (path === "/") return
      if (/\/cart\/|\/checkout\/|\/login\/|\/account\/|\.(pdf|jpg|png|css|js)$/i.test(path)) return
      // 商品詳細のみ: /p/.../数値ID/ または /p/.../数値ID.html
      if (MYPROTEIN_DETAIL_PATH.test(path)) {
        seen.add(url.toString())
      }
    } catch {
      /* ignore */
    }
  })
  return Array.from(seen)
}

/** HTML に #product-title があるか（マイプロテイン詳細ページの目印） */
function isMyproteinDetailPage(html: string): boolean {
  const $ = load(html)
  return $("#product-title").length > 0
}

const PHRASE_404 = "お探しのページは見つかりませんでした"

/**
 * script / style / noscript を除いた HTML。
 * 全ページに含まれる tenantConfig の翻訳 JSON（pages.notfound.heading 等）に 404 文言があるため、
 * それにヒットしないよう 404 判定ではこの HTML を使う。
 */
function htmlWithoutScriptAndStyle(html: string): string {
  const $ = load(html)
  $("script, style, noscript").remove()
  return $.html()
}

/**
 * マイプロテイン 404 ページの目印: 表示用 HTML の <h1> に「お探しのページは見つかりませんでした」がある。
 * 例: <h1 class="text-small-xl md:text-xl">お探しのページは見つかりませんでした</h1>
 * 商品ページにはこの h1 がないため、ここだけで確実に 404 を判定する。
 */
function hasMyprotein404Heading(strippedHtml: string): boolean {
  const $ = load(strippedHtml)
  return $("h1")
    .toArray()
    .some((el) => $(el).text().trim().includes(PHRASE_404))
}

/**
 * マイプロテインの「お探しのページは見つかりませんでした」系のレスポンスか（200で返る404）。
 * script 除く HTML の <h1> に該当文言がある場合のみ 404 とする（サイト固有の 404 レイアウトに合わせる）。
 */
function isMyproteinNotFoundPage(html: string): boolean {
  const stripped = htmlWithoutScriptAndStyle(html)
  return hasMyprotein404Heading(stripped)
}

/** 404判定の調査用：取得したHTMLから「サーバーが何を返したか」を要約する（script 除く） */
function getPageDiagnostic(html: string): {
  has_404_phrase: boolean
  is_404_phrase_visible: boolean
  product_title_preview: string
  doc_title: string
  product_title_length: number
} {
  const $ = load(html)
  const stripped = htmlWithoutScriptAndStyle(html)
  const productTitle = $("#product-title").first().text().trim()
  const docTitle = $("title").first().text().trim()
  const has404H1 = hasMyprotein404Heading(stripped)
  return {
    has_404_phrase: stripped.includes(PHRASE_404),
    is_404_phrase_visible: has404H1,
    product_title_preview: productTitle.slice(0, 80) || "(空)",
    product_title_length: productTitle.length,
    doc_title: docTitle.slice(0, 80) || "(空)"
  }
}

type DebugStep = { step: string; ok: boolean; ms?: number; error?: string; detail?: unknown }

async function debugRunStep(
  name: string,
  fn: () => Promise<unknown>,
  timeoutMs: number,
  steps: DebugStep[]
): Promise<unknown> {
  const start = Date.now()
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`タイムアウト(${timeoutMs}ms)`)), timeoutMs)
      )
    ])
    steps.push({ step: name, ok: true, ms: Date.now() - start, detail: result })
    return result
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    steps.push({ step: name, ok: false, ms: Date.now() - start, error: err })
    return null
  }
}

type AiExtractResult = {
  is_single_product_page?: boolean
  is_protein_related?: boolean | null
  manufacturer?: string | null
  flavor?: string | null
  unit_text?: string | null
  price_jpy?: number | null
  price_per_kg?: number | null
  net_weight_kg?: number | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  nutrition_basis_raw?: string | null
  serving_size_g?: number | null
  error?: string
}

/** この時間を過ぎたら診断用レスポンスを返す。20件で約40分かかるため 50 分に設定 */
const FALLBACK_AFTER_MS = 50 * 60 * 1000

export async function POST(req: Request) {
  const work = (async () => {
    try {
      return await handlePost(req)
    } catch (e) {
      console.error("[ai-extract-test]", e)
      return NextResponse.json(
        {
          error: "処理中にエラーが発生しました。",
          details: e instanceof Error ? e.message : String(e)
        },
        { status: 500 }
      )
    }
  })()
  const fallback = new Promise<NextResponse>((resolve) => {
    setTimeout(
      () =>
        resolve(
          NextResponse.json({
            error: "diagnostic",
            message: `${FALLBACK_AFTER_MS / 1000}秒以内に完了しませんでした。Supabase またはマイプロテインへの fetch でハングしている可能性があります。手動で urls を渡すと一覧取得をスキップできます。`,
            elapsed_sec: FALLBACK_AFTER_MS / 1000
          })
        ),
      FALLBACK_AFTER_MS
    )
  })
  return Promise.race([work, fallback])
}

/** 一覧から URL が取れない原因を調べる。各ステップの結果・所要時間・エラーを返す。 */
async function runDebugListFetch(): Promise<NextResponse> {
  const steps: DebugStep[] = []
  const DB_MS = 10_000
  const FETCH_MS = 20_000

  const sources = await debugRunStep(
    "1_manufacturer_sources",
    () => supabase.from("manufacturer_sources").select("id, url").ilike("manufacturer_code", "myprotein").then((r) => ({ data: r.data, error: r.error })),
    DB_MS,
    steps
  )
  const listUrl = (sources as { data?: { url?: string }[] } | null)?.data?.[0]?.url
  if (!listUrl) {
    return NextResponse.json({
      message: "一覧URL取得のデバッグ結果（manufacturer_sources で URL が取れませんでした）",
      steps
    })
  }

  await debugRunStep(
    "2_manufacturer_products",
    () => supabase.from("manufacturer_products").select("source_url").or("manufacturer_code.eq.myprotein,manufacturer_name.ilike.%Myprotein%").not("source_url", "is", null).limit(10).then((r) => ({ count: r.data?.length ?? 0 })),
    DB_MS,
    steps
  )

  const listRes = await debugRunStep(
    "3_fetch_list_page",
    () =>
      fetchWithTimeout(listUrl, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.8" },
        timeoutMs: FETCH_MS
      }).then((r) => ({ status: r.status, ok: r.ok, headersContentType: r.headers.get("content-type")?.slice(0, 50) })),
    FETCH_MS + 2000,
    steps
  )

  let listHtml: string | null = null
  if ((listRes as { ok?: boolean } | null)?.ok !== false) {
    const rawRes = await debugRunStep(
      "4_read_list_body",
      () =>
        fetchWithTimeout(listUrl, { headers: { "User-Agent": USER_AGENT }, timeoutMs: FETCH_MS }).then((r) => r.text()),
      FETCH_MS + 5000,
      steps
    )
    if (typeof rawRes === "string") listHtml = rawRes
  }

  let linksCount = 0
  let sampleLinks: string[] = []
  if (listHtml && listHtml.length > 100) {
    const links = collectProductLikeLinks(listHtml, listUrl)
    linksCount = links.length
    sampleLinks = links.slice(0, 5)
    steps.push({
      step: "5_parse_links",
      ok: true,
      detail: { links_count: linksCount, sample_urls: sampleLinks }
    })
  } else {
    steps.push({
      step: "5_parse_links",
      ok: false,
      error: listHtml ? `HTMLが短い(${listHtml.length}文字)` : "HTML未取得"
    })
  }

  if (sampleLinks.length > 0) {
    const firstUrl = sampleLinks[0]
    await debugRunStep(
      "6_fetch_first_detail",
      () =>
        fetchWithTimeout(firstUrl, { headers: { "User-Agent": USER_AGENT }, timeoutMs: 15000 })
          .then((r) => r.text())
          .then((html) => ({ url: firstUrl.slice(0, 70), has_product_title: isMyproteinDetailPage(html), html_length: html.length })),
      20_000,
      steps
    )
  }

  return NextResponse.json({
    message: "一覧URL取得のデバッグ結果。どの step で ok:false か確認してください。",
    list_url: listUrl,
    steps
  })
}

async function handlePost(req: Request): Promise<NextResponse> {
  let body: { manufacturer_code?: string; limit?: number; urls?: string[]; ping?: boolean; debug?: boolean } = {}
  try {
    body = await req.json().catch(() => ({}))
  } catch {
    /* use defaults */
  }
  if (body.ping === true) {
    return NextResponse.json({ ok: true, message: "ai-extract-test endpoint is reachable" })
  }
  if (body.debug === true) {
    return await runDebugListFetch()
  }
  const manufacturerCode = (body.manufacturer_code ?? "myprotein").toLowerCase()
  const limit = Math.min(Math.max(Number(body.limit) ?? DEFAULT_LIMIT, 1), 50)
  const manualUrls = Array.isArray(body.urls) ? body.urls.filter((u) => typeof u === "string" && u.startsWith("http")).slice(0, limit) : []

  if (manufacturerCode !== "myprotein") {
    return NextResponse.json(
      { error: "現在サポートしているのは manufacturer_code: myprotein のみです。" },
      { status: 400 }
    )
  }

  const origin = new URL(req.url).origin
  const aiExtractUrl = `${origin}/api/ai-extract-product`

  const DB_TIMEOUT_MS = 15_000
  const withTimeout = <T>(p: Promise<T>, ms: number, msg: string): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
    ])

  // 1) manufacturer_sources からマイプロテインの URL を取得
  const { data: sources, error: srcError } = await withTimeout(
    supabase
      .from("manufacturer_sources")
      .select("id, manufacturer_name, url, manufacturer_code")
      .ilike("manufacturer_code", "myprotein"),
    DB_TIMEOUT_MS,
    "manufacturer_sources の取得がタイムアウトしました"
  )

  if (srcError || !sources?.length) {
    return NextResponse.json(
      {
        error: "manufacturer_sources に myprotein の登録がありません。",
        details: srcError?.message
      },
      { status: 400 }
    )
  }

  const listUrl = (sources[0] as { url: string }).url

  // 2) 取得するURL一覧（手動 urls がなければ一覧から収集 or DB の source_url）
  let urlsToFetch: string[] = []
  type ExistingRow = {
    source_url: string
    product_name?: string
    flavor?: string
    unit_text?: string
    price_yen?: number
    price_per_kg?: number
    calories?: number
    protein_g?: number
    carbs_g?: number
    fat_g?: number
  }
  const existingByUrl = new Map<string, ExistingRow>()

  const { data: existingRows } = await withTimeout(
    supabase
      .from("manufacturer_products")
      .select("source_url, product_name, flavor, unit_text, price_yen, price_per_kg, calories, protein_g, carbs_g, fat_g")
      .or("manufacturer_code.eq.myprotein,manufacturer_name.ilike.%Myprotein%")
      .not("source_url", "is", null)
      .limit(500),
    DB_TIMEOUT_MS,
    "manufacturer_products の取得がタイムアウトしました"
  )

  for (const r of (existingRows ?? []) as ExistingRow[]) {
    const url = r.source_url
    if (url && !existingByUrl.has(url)) {
      existingByUrl.set(url, r)
    }
  }

  if (manualUrls.length > 0) {
    urlsToFetch = manualUrls
  } else {
  try {
    const LIST_STEP_MS = 35_000
    const listHtml = await Promise.race([
      (async () => {
        const listRes = await fetchWithTimeout(listUrl, {
          headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.8" }
        })
        if (!listRes.ok) return null
        return listRes.text()
      })(),
      new Promise<string | null>((_, reject) =>
        setTimeout(() => reject(new Error(`一覧取得が${LIST_STEP_MS / 1000}sでタイムアウトしました`)), LIST_STEP_MS)
      )
    ])
    if (listHtml) {
      const links = collectProductLikeLinks(listHtml, listUrl)
      const seen = new Set<string>()
      for (const u of links) {
        if (seen.has(u) || urlsToFetch.length >= limit) break
        try {
          const detailRes = await fetchWithTimeout(u, { headers: { "User-Agent": USER_AGENT } })
          if (detailRes.ok) {
            const html = await detailRes.text()
            if (!isMyproteinNotFoundPage(html) && isMyproteinDetailPage(html)) {
              urlsToFetch.push(u)
              seen.add(u)
            }
          }
          await sleep(randomDelay())
        } catch {
          /* skip */
        }
      }
    }
  } catch (e) {
    console.warn("[ai-extract-test] list fetch failed", e)
  }

  // リストから十分取れなかった場合、DB に保存されている URL を追加（重複除く）
  if (urlsToFetch.length < limit) {
    const seen = new Set(urlsToFetch)
    for (const url of existingByUrl.keys()) {
      if (seen.has(url)) continue
      if (urlsToFetch.length >= limit) break
      urlsToFetch.push(url)
      seen.add(url)
    }
  }

  urlsToFetch = urlsToFetch.slice(0, limit)
  }

  if (urlsToFetch.length === 0) {
    return NextResponse.json(
      {
        message:
          "取得できる商品URLが0件でした。一覧がJS描画の場合は POST body に urls: [\"https://...\", ...] で詳細ページURLを20件指定して再試行してください。",
        list_url: listUrl
      },
      { status: 200 }
    )
  }

  type Diagnostic = {
    has_404_phrase: boolean
    is_404_phrase_visible?: boolean
    product_title_preview: string
    doc_title: string
    product_title_length: number
  }
  const results: {
    url: string
    existing?: ExistingRow
    page_text_preview?: string
    ai?: AiExtractResult
    fetch_error?: string
    diagnostic?: Diagnostic
  }[] = []
  const startTime = Date.now()

  for (const url of urlsToFetch) {
    if (Date.now() - startTime > MAX_TOTAL_MS) break
    const existing = existingByUrl.get(url)
    let fetchError: string | undefined
    let pageText = ""
    let aiResult: AiExtractResult | undefined
    let diagnostic: Diagnostic | undefined

    try {
      const res = await fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.8" }
      })
      if (!res.ok) {
        fetchError = `HTTP ${res.status}`
        results.push({ url, existing, fetch_error: fetchError })
        await sleep(randomDelay())
        continue
      }
      const html = await res.text()
      diagnostic = getPageDiagnostic(html)
      if (isMyproteinNotFoundPage(html)) {
        fetchError = "ページが見つかりませんでした（404）"
        results.push({ url, existing, fetch_error: fetchError, diagnostic })
        await sleep(randomDelay())
        continue
      }
      pageText = extractPageTextFromHtml(html, url)
      if (pageText.length < 200) {
        fetchError = "ページテキストが短すぎます"
        results.push({ url, existing, page_text_preview: pageText.slice(0, 300), fetch_error: fetchError, diagnostic })
        await sleep(randomDelay())
        continue
      }
    } catch (e) {
      fetchError = e instanceof Error ? e.message : String(e)
      if ((e as { name?: string })?.name === "AbortError") {
        fetchError = `タイムアウト(${FETCH_PAGE_TIMEOUT_MS / 1000}s)`
      }
      results.push({ url, existing, fetch_error: fetchError })
      await sleep(randomDelay())
      continue
    }

    try {
      const aiRes = await fetchWithTimeout(aiExtractUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_text: pageText }),
        timeoutMs: AI_CALL_TIMEOUT_MS
      })
      const data = await aiRes.json().catch(() => ({}))
      if (data.error && !data.is_single_product_page) {
        aiResult = { error: data.error }
      } else {
        aiResult = {
          is_single_product_page: data.is_single_product_page,
          is_protein_related: data.is_protein_related,
          manufacturer: data.manufacturer,
          flavor: data.flavor,
          unit_text: data.unit_text,
          price_jpy: data.price_jpy,
          price_per_kg: data.price_per_kg,
          net_weight_kg: data.net_weight_kg,
          calories: data.calories,
          protein_g: data.protein_g,
          carbs_g: data.carbs_g,
          fat_g: data.fat_g,
          nutrition_basis_raw: data.nutrition_basis_raw,
          serving_size_g: data.serving_size_g,
          error: data.error
        }
      }
    } catch (e) {
      aiResult = {
        error: (e as { name?: string })?.name === "AbortError"
          ? `AI呼び出しタイムアウト(${AI_CALL_TIMEOUT_MS / 1000}s)`
          : e instanceof Error ? e.message : String(e)
      }
    }

    results.push({
      url,
      existing,
      page_text_preview: pageText.slice(0, 400) + (pageText.length > 400 ? "…" : ""),
      ai: aiResult,
      diagnostic
    })
    await sleep(randomDelay())
  }

  const aiOk = results.filter((r) => r.ai && !r.ai.error && r.ai.is_single_product_page).length
  const withNutrition = results.filter(
    (r) => r.ai && r.ai.protein_g != null
  ).length

  const timedOut = Date.now() - startTime >= MAX_TOTAL_MS
  return NextResponse.json({
    manufacturer_code: manufacturerCode,
    list_url: listUrl,
    total_requested: limit,
    total_fetched: results.length,
    total_ai_ok: aiOk,
    total_with_nutrition: withNutrition,
    partial_due_to_timeout: timedOut,
    elapsed_ms: Date.now() - startTime,
    results
  })
}

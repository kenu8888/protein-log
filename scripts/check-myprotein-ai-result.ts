#!/usr/bin/env npx tsx
/**
 * マイプロテイン AI 抽出テスト結果（myprotein-ai-test-result.json）の取得率を集計する。
 * Amazon の check_sync_result.py と同様の形式で表示。
 *
 * 使い方:
 *   npx tsx scripts/check-myprotein-ai-result.ts
 *   npx tsx scripts/check-myprotein-ai-result.ts path/to/result.json
 *   npx tsx scripts/check-myprotein-ai-result.ts --missing              … 未取得のURL一覧（全項目）
 *   npx tsx scripts/check-myprotein-ai-result.ts --missing protein_g     … タンパク質(g) が未取得のURLのみ
 *   npx tsx scripts/check-myprotein-ai-result.ts --missing --diagnostic … 未取得URLごとに diagnostic（404調査用）を表示
 */

import { readFileSync, existsSync } from "fs"
import { resolve } from "path"

// curl -o myprotein-ai-test-result.json でプロジェクトルートに保存されることが多いので両方探す
const CANDIDATE_PATHS = [
  resolve(process.cwd(), "myprotein-ai-test-result.json"),
  resolve(process.cwd(), "scripts/myprotein-ai-test-result.json"),
]

type AiRow = {
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

type Diagnostic = {
  has_404_phrase?: boolean
  is_404_phrase_visible?: boolean
  product_title_preview?: string
  doc_title?: string
  product_title_length?: number
}

type ResultItem = {
  url: string
  existing?: unknown
  ai?: AiRow
  fetch_error?: string
  diagnostic?: Diagnostic
}

type Payload = {
  results?: ResultItem[]
  total_fetched?: number
  total_ai_ok?: number
  total_with_nutrition?: number
}

const FIELDS: [string, keyof AiRow][] = [
  ["単体商品ページ", "is_single_product_page"],
  ["プロテイン関連", "is_protein_related"],
  ["メーカー", "manufacturer"],
  ["フレーバー", "flavor"],
  ["内容量(表記)", "unit_text"],
  ["価格(円)", "price_jpy"],
  ["1kg単価", "price_per_kg"],
  ["内容量(kg)", "net_weight_kg"],
  ["カロリー", "calories"],
  ["タンパク質(g)", "protein_g"],
  ["炭水化物(g)", "carbs_g"],
  ["脂質(g)", "fat_g"],
  ["栄養基準", "nutrition_basis_raw"],
  ["1食あたり(g)", "serving_size_g"],
]

function isFilled(val: unknown): boolean {
  if (val === null || val === undefined) return false
  if (typeof val === "string" && !val.trim()) return false
  if (typeof val === "boolean") return true
  if (typeof val === "number" && Number.isFinite(val)) return true
  return true
}

const MISSING_TARGET_FIELDS: [string, keyof AiRow][] = [
  ["フレーバー", "flavor"],
  ["カロリー", "calories"],
  ["タンパク質(g)", "protein_g"],
  ["炭水化物(g)", "carbs_g"],
  ["脂質(g)", "fat_g"],
  ["栄養基準", "nutrition_basis_raw"],
  ["1食あたり(g)", "serving_size_g"],
]

function listMissing(
  path: string,
  data: Payload,
  onlyField?: keyof AiRow,
  showDiagnostic?: boolean
): void {
  const results = data.results ?? []
  const rows = results.filter((r) => r.ai && !r.fetch_error) as (ResultItem & { ai: AiRow })[]
  const targetFields = onlyField
    ? MISSING_TARGET_FIELDS.filter(([, key]) => key === onlyField)
    : MISSING_TARGET_FIELDS
  const missingList: { url: string; labels: string[]; diagnostic?: Diagnostic }[] = []
  for (const row of rows) {
    const labels: string[] = []
    for (const [label, key] of targetFields) {
      if (!isFilled(row.ai[key])) labels.push(label)
    }
    if (labels.length > 0) {
      missingList.push({ url: row.url, labels, diagnostic: row.diagnostic })
    }
  }
  if (missingList.length === 0) {
    const scope = onlyField ? `「${MISSING_TARGET_FIELDS.find(([, k]) => k === onlyField)?.[0]}」` : "フレーバー・栄養成分・1食あたり(g)"
    console.log(`${scope} はいずれも全件取得済みです。`)
    return
  }
  const scope = onlyField ? `「${MISSING_TARGET_FIELDS.find(([, k]) => k === onlyField)?.[0]}」未取得` : "フレーバー・栄養成分・1食あたり(g) のいずれかが未取得"
  console.log(`【${scope}】 ${missingList.length} 件\n`)
  console.log("  URL と未取得項目")
  console.log("  " + "-".repeat(72))
  for (const { url, labels, diagnostic } of missingList) {
    const short = url.length > 68 ? url.slice(0, 65) + "…" : url
    console.log(`  ${short}`)
    console.log(`  未取得: ${labels.join(", ")}`)
    if (showDiagnostic && diagnostic) {
      console.log(
        `  diagnostic: has_404_phrase=${diagnostic.has_404_phrase} is_404_phrase_visible=${diagnostic.is_404_phrase_visible ?? "?"} product_title_length=${diagnostic.product_title_length ?? "?"} doc_title=${(diagnostic.doc_title ?? "").slice(0, 40)}…`
      )
    }
    console.log()
  }
  console.log("  " + "-".repeat(72))
  console.log(`合計: ${missingList.length} 件`)
}

const KNOWN_FIELD_KEYS = new Set(MISSING_TARGET_FIELDS.map(([, k]) => k))

function main(): void {
  const args = process.argv.slice(2)
  const missingIdx = args.indexOf("--missing")
  const missing = missingIdx !== -1
  const showDiagnostic = args.includes("--diagnostic")
  const missingField =
    missing && args[missingIdx + 1] && KNOWN_FIELD_KEYS.has(args[missingIdx + 1] as keyof AiRow)
      ? (args[missingIdx + 1] as keyof AiRow)
      : undefined
  const pathArg = args.find((a) => a.endsWith(".json") || a.includes("/"))
  let path: string
  if (pathArg) {
    path = resolve(process.cwd(), pathArg)
  } else {
    const found = CANDIDATE_PATHS.find((p) => existsSync(p))
    path = found ?? CANDIDATE_PATHS[0]
  }

  let raw: string
  try {
    raw = readFileSync(path, "utf-8")
  } catch (e) {
    console.error(`ファイルが見つかりません: ${path}`)
    console.error("先にマイプロテイン AI テストを実行し、結果を JSON で保存してください。")
    console.error("  curl ... -o myprotein-ai-test-result.json  → プロジェクトルートに保存")
    console.error("  または: npx tsx scripts/check-myprotein-ai-result.ts  path/to/result.json")
    process.exit(1)
  }

  let data: Payload
  try {
    data = JSON.parse(raw) as Payload
  } catch {
    console.error("JSON のパースに失敗しました。")
    process.exit(1)
  }

  const results = data.results ?? []
  const rows = results
    .filter((r) => r.ai && !r.fetch_error)
    .map((r) => r.ai!) as AiRow[]

  const total = rows.length
  if (total === 0) {
    console.log("AI 結果が 0 件です（fetch_error や ai 未取得の行は除く）。")
    console.log(`total_fetched: ${data.total_fetched ?? "?"}, total_ai_ok: ${data.total_ai_ok ?? "?"}`)
    const withFetchError = results.filter((r) => r.fetch_error)
    const withAiError = results.filter((r) => r.ai?.error && !r.fetch_error)
    if (withFetchError.length > 0 || withAiError.length > 0) {
      const byFetchErr = new Map<string, number>()
      for (const r of withFetchError) {
        const msg = r.fetch_error ?? "不明"
        byFetchErr.set(msg, (byFetchErr.get(msg) ?? 0) + 1)
      }
      const byAiErr = new Map<string, number>()
      for (const r of withAiError) {
        const msg = r.ai?.error ?? "不明"
        byAiErr.set(msg, (byAiErr.get(msg) ?? 0) + 1)
      }
      console.log("")
      if (byFetchErr.size > 0) {
        console.log("fetch_error の内訳:")
        for (const [msg, count] of byFetchErr) console.log(`  ${count} 件: ${msg}`)
      }
      if (byAiErr.size > 0) {
        console.log("ai.error の内訳:")
        for (const [msg, count] of byAiErr) console.log(`  ${count} 件: ${msg}`)
      }
    }
    process.exit(0)
  }

  if (missing) {
    console.log(`対象ファイル: ${path}`)
    console.log(`総件数（AI結果あり）: ${total} 件\n`)
    listMissing(path, data, missingField, showDiagnostic)
    return
  }

  console.log(`対象ファイル: ${path}`)
  console.log(`総件数（AI結果あり）: ${total} 件`)
  console.log(`（total_fetched: ${data.total_fetched ?? "?"}, total_ai_ok: ${data.total_ai_ok ?? "?"}, total_with_nutrition: ${data.total_with_nutrition ?? "?"}）\n`)
  console.log("取得率:")
  console.log("-".repeat(56))

  const totalFields = FIELDS.length
  let totalFilledCells = 0

  for (const [label, key] of FIELDS) {
    const count = rows.filter((row) => isFilled(row[key])).length
    const pct = total ? (count / total) * 100 : 0
    const bar = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5))
    console.log(`  ${label.padEnd(16)} ${String(count).padStart(3)}/${total}  ${pct.toFixed(1).padStart(5)}%  ${bar}`)
    totalFilledCells += count
  }

  console.log("-".repeat(56))
  const maxCells = total * totalFields
  const totalPct = maxCells ? (totalFilledCells / maxCells) * 100 : 0
  console.log(`  ${"TOTAL".padEnd(16)} ${String(totalFilledCells).padStart(3)}/${maxCells}  ${totalPct.toFixed(1).padStart(5)}%`)

  const coreKeys: (keyof AiRow)[] = ["price_jpy", "net_weight_kg", "price_per_kg", "unit_text"]
  const extendedKeys: (keyof AiRow)[] = ["calories", "protein_g", "manufacturer", "flavor"]
  const coreOk = rows.filter((row) => coreKeys.every((k) => isFilled(row[k]))).length
  const extendedOk = rows.filter((row) => extendedKeys.every((k) => isFilled(row[k]))).length
  console.log(`\nコア4項目（価格・内容量・単価・容量表記）すべて取得: ${coreOk}/${total} 件`)
  console.log(`拡張4項目（カロリー・蛋白・メーカー・フレーバー）すべて取得: ${extendedOk}/${total} 件`)
}

main()

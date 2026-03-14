import { NextResponse } from "next/server"
import { classifyProtein } from "../../../../src/lib/classifyProtein"
import {
  fetchPendingSourceTexts,
  saveClassificationResult,
  updateSourceStatus
} from "../../../../src/lib/batchDb"

type Body = { limit?: number }

const MAX_LIMIT = 150

/**
 * POST /api/batch/classify
 * pending の protein_source_texts を最大 limit 件まで AI 分類し、
 * product_classification_results に保存する。
 * メーカースクレイプ後に「画面にすぐ反映」するために利用。
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body
  const limit = Math.min(
    Math.max(body.limit ?? 50, 1),
    MAX_LIMIT
  )

  const pending = await fetchPendingSourceTexts(limit)
  let processed = 0
  let excluded = 0
  let errors = 0

  for (const row of pending) {
    try {
      const result = await classifyProtein(row.raw_text)
      await saveClassificationResult(row.id, result)
      const status = result.is_protein_powder ? "processed" : "excluded"
      await updateSourceStatus(row.id, status)
      if (status === "processed") processed += 1
      else excluded += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await updateSourceStatus(row.id, "error", message)
      errors += 1
    }
  }

  return NextResponse.json(
    {
      message: "分類バッチ完了",
      processed,
      excluded,
      errors,
      total: pending.length,
      limit
    },
    { status: 200 }
  )
}

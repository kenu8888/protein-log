import { NextResponse } from "next/server"
import { classifyProtein } from "../../../../src/lib/classifyProtein"
import {
  fetchPendingSourceTexts,
  fetchSourceTextsByIds,
  findSourceTextIdsByProduct,
  saveClassificationResult,
  updateSourceStatus
} from "../../../../src/lib/batchDb"

type Body = {
  limit?: number
  /** 指定した source_text_id のみ再分類（status 不問） */
  sourceTextIds?: string[]
  /** 商品名・メーカー名で該当 source_text を検索してから再分類（例: { manufacturer: "My Routine", productName: "マッスルストロベリー" }） */
  productMatch?: { manufacturer: string; productName: string }
}

const MAX_LIMIT = 150

/**
 * POST /api/batch/classify
 * pending の protein_source_texts を最大 limit 件まで AI 分類し、
 * product_classification_results に保存する。
 * productMatch または sourceTextIds を指定した場合は該当行のみ再分類（status 不問）。
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body
  const limit = Math.min(
    Math.max(body.limit ?? 50, 1),
    MAX_LIMIT
  )

  let pending: Awaited<ReturnType<typeof fetchPendingSourceTexts>>
  if (body.productMatch?.manufacturer && body.productMatch?.productName) {
    const ids = await findSourceTextIdsByProduct(
      body.productMatch.manufacturer,
      body.productMatch.productName
    )
    pending = await fetchSourceTextsByIds(ids)
  } else if (body.sourceTextIds?.length) {
    pending = await fetchSourceTextsByIds(body.sourceTextIds)
  } else {
    pending = await fetchPendingSourceTexts(limit)
  }
  let processed = 0
  let excluded = 0
  let errors = 0
  let firstErrorMessage: string | null = null

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
      if (errors === 0) firstErrorMessage = message
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
      limit,
      ...(firstErrorMessage && { first_error: firstErrorMessage })
    },
    { status: 200 }
  )
}

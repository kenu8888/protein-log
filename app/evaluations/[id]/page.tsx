'use client'

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"

type ClassifiedDetail = {
  id: string
  manufacturer: string | null
  product_name: string | null
  flavor: string | null
  display_manufacturer: string | null
  display_product_name: string | null
  display_flavor: string | null
  price_jpy: number | null
  protein_grams_per_serving: number | null
  calories: number | null
  carbs: number | null
  fat: number | null
  price_per_kg: number | null
  product_url: string | null
  product_image_url: string | null
  is_in_stock: boolean | null
  confidence: number | null
}

type QuickRatingSummary = {
  avgTaste: number | null
  avgMixability: number | null
  avgCostPerformance: number | null
  avgRepeatIntent: number | null
  avgFoam: number | null
  avgSweetness: number | null
  avgRichness: number | null
  avgMilkFeel: number | null
  avgArtificialSweetener: number | null
  count: number
}

type MyQuickRating = {
  taste: number
  mixability: number
  costPerformance: number
  repeatIntent: number
  foam: number
  sweetness: number
  richness: number
  milkFeel: number
  artificialSweetener: number
}

type RadarMetrics = {
  taste: number            // 味のおいしさ
  mixability: number       // 混ざりやすさ
  costPerformance: number  // コスパ
  repeatIntent: number     // リピート意向
  foam: number             // 泡立ち
}

type DummyReview = {
  id: string
  nickname: string
  title: string
  body: string
  created_at: string
}

function RadarChart({ metrics }: { metrics: RadarMetrics }) {
  const size = 220
  const center = size / 2
  const radius = 80
  const keys: (keyof RadarMetrics)[] = [
    "taste",
    "mixability",
    "costPerformance",
    "repeatIntent",
    "foam"
  ]

  const { polygonPoints, axisPoints } = useMemo(() => {
    const points: string[] = []
    const axes: { x: number; y: number }[] = []

    keys.forEach((key, index) => {
      const angle = (Math.PI * 2 * index) / keys.length - Math.PI / 2
      const value = Math.max(0, Math.min(5, metrics[key])) / 5
      const r = radius * value
      const x = center + r * Math.cos(angle)
      const y = center + r * Math.sin(angle)
      points.push(`${x},${y}`)

      const ax = center + radius * Math.cos(angle)
      const ay = center + radius * Math.sin(angle)
      axes.push({ x: ax, y: ay })
    })

    return { polygonPoints: points.join(" "), axisPoints: axes }
  }, [metrics])

  return (
    <svg width={size} height={size} className="text-xs text-gray-600">
      <circle
        cx={center}
        cy={center}
        r={radius}
        className="fill-transparent stroke-gray-200"
      />
      <circle
        cx={center}
        cy={center}
        r={radius * 0.66}
        className="fill-transparent stroke-gray-200"
      />
      <circle
        cx={center}
        cy={center}
        r={radius * 0.33}
        className="fill-transparent stroke-gray-200"
      />

      {axisPoints.map((p, idx) => (
        <line
          key={idx}
          x1={center}
          y1={center}
          x2={p.x}
          y2={p.y}
          className="stroke-gray-200"
        />
      ))}

      <polygon
        points={polygonPoints}
        className="fill-blue-100 stroke-blue-400"
        fillOpacity={0.65}
      />
    </svg>
  )
}

export default function EvaluationDetailPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : undefined
  const [detail, setDetail] = useState<ClassifiedDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const [summary, setSummary] = useState<QuickRatingSummary>({
    avgTaste: null,
    avgMixability: null,
    avgCostPerformance: null,
    avgRepeatIntent: null,
    avgFoam: null,
    avgSweetness: null,
    avgRichness: null,
    avgMilkFeel: null,
    avgArtificialSweetener: null,
    count: 0
  })
  const [myRating, setMyRating] = useState<MyQuickRating>({
    taste: 3,
    mixability: 3,
    costPerformance: 3,
    repeatIntent: 3,
    foam: 3,
    sweetness: 3,
    richness: 3,
    milkFeel: 3,
    artificialSweetener: 3
  })
  const [saving, setSaving] = useState(false)
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false)
  const [showRatingBanner, setShowRatingBanner] = useState(false)

  const router = useRouter()

  // ダミーのレビュー・スコア（後で DB 接続に置き換え予定）
  const dummyReviews: DummyReview[] = [
    {
      id: "1",
      nickname: "筋トレ歴3年",
      title: "毎日飲める定番の味",
      body:
        "トレーニング後に毎日飲んでいます。ダマも少なく、シェイカーがあれば問題なく溶けます。甘さは控えめで後味もスッキリしているので、長く続けやすいと感じました。",
      created_at: "2025-01-10"
    },
    {
      id: "2",
      nickname: "甘党",
      title: "もう少し甘さが欲しい",
      body:
        "個人的にはもう少し甘くても良いかなという印象です。水よりも牛乳で割るとちょうど良い甘さになり、デザート感覚で飲めました。ダマは多少できますが、よく振れば気にならない程度です。",
      created_at: "2025-01-08"
    },
    {
      id: "3",
      nickname: "女性会社員",
      title: "香りと後味が好み",
      body:
        "プロテイン特有の粉っぽさが少なく、香りも自然で飲みやすいです。後味に嫌な苦みが残らないので、朝食代わりにも使っています。",
      created_at: "2025-01-05"
    }
  ]

  // レーダーチャート用のダミースコア（0〜5）
  const metrics: RadarMetrics = {
    taste: 4.2,
    mixability: 4.1,
    costPerformance: 3.8,
    repeatIntent: 4.0,
    foam: 3.2
  }

  // 好みが分かれる軸のダミースコア（0〜100）
  const preferenceLevels = {
    sweetness: 45, // 甘さ
    richness: 55,  // 味の濃さ
    milkFeel: 40,  // ミルク感
    artificialSweetener: 35 // 人工甘味料感
  }

  function getClientToken(): string | null {
    if (typeof window === "undefined") return null
    const key = "protein-log-client-token"
    const existing = window.localStorage.getItem(key)
    if (existing) return existing
    const token = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    window.localStorage.setItem(key, token)
    return token
  }

  async function loadQuickRatings(productId: string) {
    const token = getClientToken()
    let data: any[] | null = null

    try {
      const result = await supabase
        .from("product_quick_ratings")
        // スキーマ差異による「列が存在しない」エラーを避けるため、まずは * で取得
        .select("*")
        .eq("product_result_id", productId)

      if (result.error && (result.error as any).message) {
        console.error(
          "failed to load quick ratings",
          (result.error as any).message,
          result.error
        )
        return
      }

      data = (result.data as any[]) ?? []
    } catch (e) {
      console.error("failed to load quick ratings (exception)", e)
      return
    }

    if (!data || data.length === 0) {
      setSummary({
        avgTaste: null,
        avgMixability: null,
        avgCostPerformance: null,
        avgRepeatIntent: null,
        avgFoam: null,
        avgSweetness: null,
        avgRichness: null,
        avgMilkFeel: null,
        avgArtificialSweetener: null,
        count: 0
      })
      return
    }

    let sumTaste = 0
    let sumMix = 0
    let sumCost = 0
    let sumRepeat = 0
    let sumFoam = 0
    let sumSweet = 0
    let sumRich = 0
    let sumMilk = 0
    let sumArt = 0
    let count = 0

    for (const row of data as any[]) {
      if (typeof row.taste === "number") sumTaste += row.taste
      if (typeof row.mixability === "number") sumMix += row.mixability
      if (typeof row.cost_performance === "number")
        sumCost += row.cost_performance
      if (typeof row.repeat_intent === "number") sumRepeat += row.repeat_intent
      if (typeof row.foam === "number") sumFoam += row.foam
      if (typeof row.sweetness === "number") {
        sumSweet += row.sweetness
      }
      if (typeof row.richness === "number") sumRich += row.richness
      if (typeof row.milk_feel === "number") sumMilk += row.milk_feel
      if (typeof row.artificial_sweetener === "number")
        sumArt += row.artificial_sweetener
      count += 1
      if (token && row.client_token === token) {
        setMyRating({
          taste: typeof row.taste === "number" ? (row.taste as number) : 3,
          mixability:
            typeof row.mixability === "number" ? (row.mixability as number) : 3,
          costPerformance:
            typeof row.cost_performance === "number"
              ? (row.cost_performance as number)
              : 3,
          repeatIntent:
            typeof row.repeat_intent === "number"
              ? (row.repeat_intent as number)
              : 3,
          foam: typeof row.foam === "number" ? (row.foam as number) : 3,
          sweetness:
            typeof row.sweetness === "number" ? (row.sweetness as number) : 3,
          richness:
            typeof row.richness === "number" ? (row.richness as number) : 3,
          milkFeel:
            typeof row.milk_feel === "number" ? (row.milk_feel as number) : 3,
          artificialSweetener:
            typeof row.artificial_sweetener === "number"
              ? (row.artificial_sweetener as number)
              : 3
        })
      }
    }

    setSummary({
      avgTaste: count > 0 ? sumTaste / count : null,
      avgMixability: count > 0 ? sumMix / count : null,
      avgCostPerformance: count > 0 ? sumCost / count : null,
      avgRepeatIntent: count > 0 ? sumRepeat / count : null,
      avgFoam: count > 0 ? sumFoam / count : null,
      avgSweetness: count > 0 ? sumSweet / count : null,
      avgRichness: count > 0 ? sumRich / count : null,
      avgMilkFeel: count > 0 ? sumMilk / count : null,
      avgArtificialSweetener: count > 0 ? sumArt / count : null,
      count
    })
  }

  async function saveQuickRating(
    productId: string
  ): Promise<void> {
    const token = getClientToken()
    if (!token) return
    setSaving(true)
    const { error } = await supabase
      .from("product_quick_ratings")
      .upsert(
        {
          product_result_id: productId,
          client_token: token,
          taste: myRating.taste,
          mixability: myRating.mixability,
          cost_performance: myRating.costPerformance,
          repeat_intent: myRating.repeatIntent,
          foam: myRating.foam,
          sweetness: myRating.sweetness,
          richness: myRating.richness,
          milk_feel: myRating.milkFeel,
          artificial_sweetener: myRating.artificialSweetener
        },
        { onConflict: "product_result_id,client_token" }
      )

    if (error) {
      console.error("failed to save quick rating", error)
      setSaving(false)
      return
    }
    await loadQuickRatings(productId)
    setSaving(false)
  }

  useEffect(() => {
    async function load() {
      if (!id) {
        setError("URL パラメータが不正です。")
        setLoading(false)
        return
      }
      setLoading(true)
      setError("")
      const { data, error } = await supabase
        .from("product_classification_results")
        .select(
          "id, manufacturer, product_name, flavor, display_manufacturer, display_product_name, display_flavor, price_jpy, price_per_kg, protein_grams_per_serving, calories, carbs, fat, product_url, product_image_url, is_in_stock, confidence"
        )
        .eq("id", id)
        .maybeSingle()

      if (error) {
        console.error(error)
        setError("商品情報の取得に失敗しました。")
        setLoading(false)
        return
      }

      if (!data) {
        setError("商品が見つかりませんでした。")
        setLoading(false)
        return
      }

      const row: any = data
      const mapped: ClassifiedDetail = {
        id: row.id as string,
        manufacturer: (row.manufacturer as string) ?? null,
        product_name: (row.product_name as string) ?? null,
        flavor: (row.flavor as string) ?? null,
        display_manufacturer: (row.display_manufacturer as string) ?? null,
        display_product_name: (row.display_product_name as string) ?? null,
        display_flavor: (row.display_flavor as string) ?? null,
        price_jpy:
          typeof row.price_jpy === "number" ? (row.price_jpy as number) : null,
        price_per_kg:
          typeof row.price_per_kg === "number" ? (row.price_per_kg as number) : null,
        protein_grams_per_serving:
          typeof row.protein_grams_per_serving === "number"
            ? (row.protein_grams_per_serving as number)
            : null,
        calories:
          typeof row.calories === "number" ? (row.calories as number) : null,
        carbs:
          typeof row.carbs === "number" ? (row.carbs as number) : null,
        fat:
          typeof row.fat === "number" ? (row.fat as number) : null,
        product_url: (row.product_url as string) ?? null,
        product_image_url: (row.product_image_url as string) ?? null,
        is_in_stock:
          typeof row.is_in_stock === "boolean" ? (row.is_in_stock as boolean) : null,
        confidence:
          typeof row.confidence === "number" ? (row.confidence as number) : null
      }
      setDetail(mapped)
      await loadQuickRatings(mapped.id)
      setLoading(false)
    }

    load()
  }, [id])

  // 「飲んだことがありますか？」バナーを 5 秒後にふわっと表示
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowRatingBanner(true)
    }, 5000)
    return () => clearTimeout(timer)
  }, [])

  const renderPricePerKg = () => {
    if (!detail) return "不明"
    if (detail.price_per_kg != null) {
      return `約 ¥${Math.round(detail.price_per_kg).toLocaleString()} / kg`
    }
    if (detail.price_jpy != null) {
      return `¥${detail.price_jpy.toLocaleString()}（総額）`
    }
    if (detail.is_in_stock === false) {
      return "在庫なし"
    }
    return "不明"
  }

  const getApproxCapacityKg = () => {
    if (!detail) return null
    if (
      detail.price_jpy != null &&
      detail.price_per_kg != null &&
      detail.price_per_kg > 0
    ) {
      return detail.price_jpy / detail.price_per_kg
    }
    return null
  }

  const formatProductUrlLabel = (url: string | null) => {
    if (!url) return null
    try {
      const u = new URL(url)
      if (u.hostname.includes("amazon.")) return "Amazon"
      if (u.hostname.includes("iherb.")) return "iHerb"
      return "メーカーサイト"
    } catch {
      return "商品ページ"
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
        <header className="sticky top-0 z-30 w-full bg-[#1F2A44] text-white shadow-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <span className="text-xs font-semibold tracking-[0.18em] text-teal-200">
              PROTEIN LOG
            </span>
          </div>
        </header>
        <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
          <p className="text-xs text-[#64748B]">読み込み中です...</p>
        </main>
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
        <header className="sticky top-0 z-30 w-full bg-[#1F2A44] text-white shadow-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-[0.18em] text-teal-200">
                PROTEIN LOG
              </span>
              <span className="text-[11px] text-slate-200/80">
                あなたに合うプロテインが見つかる
              </span>
            </div>
          </div>
        </header>
        <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
          <header className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                商品が見つかりませんでした
              </h1>
              <p className="mt-1 text-sm text-[#64748B]">
                URL を確認するか、トップページから選び直してください
              </p>
              {error && (
                <p className="mt-2 text-xs text-red-500">
                  エラー詳細: {error}
                </p>
              )}
            </div>
            <Link
              href="/"
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 hover:border-slate-400 hover:bg-slate-50"
            >
              トップに戻る
            </Link>
          </header>
        </main>
        <footer className="mt-12 border-t border-slate-200 bg-[#0F172A] text-slate-100">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 text-xs text-slate-300">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-teal-200">
                PROTEIN LOG
              </p>
              <p className="text-[11px]">
                口コミとデータで比較できるプロテイン専用レビューサービス
              </p>
            </div>
            <div className="text-[10px] text-slate-400">
              &copy; {new Date().getFullYear()} Protein Log
            </div>
          </div>
        </footer>
      </div>
    )
  }

  const mainTitle =
    detail.display_product_name ?? detail.product_name ?? "名称不明のプロテイン"
  const mainManufacturer =
    detail.display_manufacturer ?? detail.manufacturer ?? "メーカー不明"
  const mainFlavor = detail.display_flavor ?? detail.flavor
  const approxCapacityKg = getApproxCapacityKg()

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* ブランドバー */}
      <header className="sticky top-0 z-30 w-full bg-[#1F2A44] text-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-[0.18em] text-teal-200">
              PROTEIN LOG
            </span>
            <span className="hidden text-[11px] text-slate-200/80 sm:inline">
              あなたに合うプロテインが見つかる
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-full border border-slate-500/60 bg-[#0F172A] px-3 py-1 text-[11px] text-slate-100 hover:border-teal-300"
            >
              トップページに戻る
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
        {/* タイトル＋価格 */}
        <section className="rounded-2xl bg-white/80 px-4 py-4 shadow-sm ring-1 ring-slate-200/70 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">
                PRODUCT DETAIL
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-[#0F172A] sm:text-2xl">
                {mainTitle}
              </h1>
              <p className="text-[13px] text-[#64748B]">
                {mainManufacturer}
                {mainFlavor ? ` ・ ${mainFlavor}` : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 text-right text-[11px] text-[#64748B]">
              <div className="space-y-0.5">
                <span>
                  1kgあたりの金額:{" "}
                  <span className="font-semibold text-[#0F172A]">
                    {renderPricePerKg()}
                  </span>
                </span>
                {detail.protein_grams_per_serving != null && (
                  <span className="block">
                    1食あたりタンパク質:{" "}
                    <span className="font-semibold text-[#0F172A]">
                      {detail.protein_grams_per_serving} g
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* メインレイアウト：左（画像＋PFC＋URL）、右（みんなの口コミ評価＋一言レビュー） */}
        <section className="grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* 左カラム */}
          <div className="space-y-4">
            {/* 画像＋商品名・フレーバー */}
            <div className="rounded-2xl bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200/70">
              {detail.product_image_url ? (
                <img
                  src={detail.product_image_url}
                  alt={mainTitle}
                  className="mx-auto max-h-64 w-full max-w-sm object-contain"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-56 w-full items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400">
                  画像はまだ登録されていません
                </div>
              )}
              <div className="mt-3 space-y-0.5 text-xs text-[#0F172A]">
                <p className="text-[13px] font-semibold">{mainTitle}</p>
                {mainFlavor && (
                  <p className="text-[11px] text-[#64748B]">フレーバー: {mainFlavor}</p>
                )}
              </div>
            </div>

            {/* 商品情報（画像のすぐ下） */}
            <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200/70">
              <h2 className="text-sm font-semibold text-[#0F172A]">
                商品情報
              </h2>
              <div className="mt-3 space-y-3 text-xs text-[#0F172A]">
                <div>
                  <p className="text-[11px] text-[#64748B]">1kgあたりの金額</p>
                  <p className="text-xl font-semibold text-[#0F172A]">
                    {detail.price_per_kg != null
                      ? `¥${Math.round(detail.price_per_kg).toLocaleString()} / kg`
                      : renderPricePerKg()}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#64748B]">販売価格</p>
                  <p className="text-base font-semibold text-[#0F172A]">
                    {detail.price_jpy != null
                      ? `¥${detail.price_jpy.toLocaleString()}${
                          approxCapacityKg != null
                            ? `（約 ${Math.round(approxCapacityKg * 1000)}g）`
                            : ""
                        }`
                      : "不明"}
                  </p>
                </div>
                <div className="pt-1 border-t border-slate-100 mt-1">
                  <p className="text-[11px] text-[#64748B] mb-0.5">販売ページ</p>
                  {detail.product_url ? (
                    <a
                      href={detail.product_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-blue-600 underline"
                    >
                      <span>{formatProductUrlLabel(detail.product_url)} で見る</span>
                    </a>
                  ) : (
                    <p className="text-[11px] text-[#94A3B8]">
                      URL 情報はまだ登録されていません
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* PFC カード */}
            <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200/70">
              <h2 className="text-sm font-semibold text-[#0F172A]">
                栄養バランス（1食あたりの目安）
              </h2>
              <dl className="mt-3 grid gap-3 text-xs text-[#0F172A] sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] text-[#64748B]">カロリー</dt>
                  <dd className="mt-0.5 font-medium">
                    {detail.calories != null ? `${detail.calories} kcal` : "不明"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#64748B]">タンパク質</dt>
                  <dd className="mt-0.5 font-medium">
                    {detail.protein_grams_per_serving != null
                      ? `${detail.protein_grams_per_serving} g`
                      : "不明"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#64748B]">糖質</dt>
                  <dd className="mt-0.5 font-medium">
                    {detail.carbs != null ? `${detail.carbs} g` : "不明"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#64748B]">脂質</dt>
                  <dd className="mt-0.5 font-medium">
                    {detail.fat != null ? `${detail.fat} g` : "不明"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 右カラム */}
          <div className="space-y-4">
            {/* みんなの口コミ評価（レーダー＋バー） */}
            <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200/70 text-xs text-[#0F172A]">
              <h2 className="text-sm font-semibold text-[#0F172A]">
                みんなの口コミ評価
              </h2>
              <p className="mt-1 text-[11px] text-[#64748B]">
                ログインなしで集めた、全体の傾向です
              </p>

              {/* レーダーチャート（星評価5軸のイメージ） */}
              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-3">
                <p className="text-[10px] text-[#64748B] mb-1">
                  味のおいしさ・混ざりやすさ・コスパ・リピート意向・泡立ちの5軸で、全体のバランスをイメージ表示しています
                </p>
                <div className="flex justify-center">
                  <RadarChart metrics={metrics} />
                </div>
              </div>

              {/* 好み4軸（甘さ・味の濃さ・ミルク感・人工甘味料感） */}
              <div className="mt-3 space-y-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] text-[#64748B]">甘さ</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-[9px] text-[#94A3B8] mb-0.5">
                      <span>控えめ寄り</span>
                      <span>甘め寄り</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-[#0F9E90]"
                        style={{
                          width: `${
                            summary.avgSweetness != null
                              ? (summary.avgSweetness / 5) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] text-[#64748B]">味の濃さ</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-[9px] text-[#94A3B8] mb-0.5">
                      <span>さっぱり寄り</span>
                      <span>濃いめ寄り</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-[#0F9E90]"
                        style={{
                          width: `${
                            summary.avgRichness != null
                              ? (summary.avgRichness / 5) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] text-[#64748B]">ミルク感</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-[9px] text-[#94A3B8] mb-0.5">
                      <span>あっさり寄り</span>
                      <span>ミルク感強め寄り</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-[#0F9E90]"
                        style={{
                          width: `${
                            summary.avgMilkFeel != null
                              ? (summary.avgMilkFeel / 5) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] text-[#64748B]">
                    人工甘味料感
                  </span>
                  <div className="flex-1">
                    <div className="flex justify-between text-[9px] text-[#94A3B8] mb-0.5">
                      <span>ほとんど感じない寄り</span>
                      <span>強く感じる寄り</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-[#0F9E90]"
                        style={{
                          width: `${
                            summary.avgArtificialSweetener != null
                              ? (summary.avgArtificialSweetener / 5) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {summary.count > 0 && (
                <p className="mt-2 text-[10px] text-[#94A3B8]">
                  {summary.count} 件の簡易評価が集まっています
                </p>
              )}
            </div>

            {/* 一言レビュー（ダミー） */}
            <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200/70 text-xs text-[#0F172A]">
              <h2 className="text-sm font-semibold text-[#0F172A]">
                最近の一言レビュー（ダミー）
              </h2>
              <ul className="mt-2 space-y-2">
                {dummyReviews.map((rev) => (
                  <li key={rev.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-[#0F172A]">{rev.title}</p>
                      <span className="ml-2 text-[10px] text-[#94A3B8]">
                        {rev.created_at} ・ {rev.nickname}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-[#64748B]">
                      {rev.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      {/* 「飲んだことがありますか？」バナー（PC: 右下 / モバイル: 画面下） */}
      {detail && (
        <div
          className={[
            "fixed inset-x-0 bottom-3 z-30 flex justify-center px-4 md:inset-x-auto md:right-4 md:bottom-4 md:justify-end pointer-events-none",
            showRatingBanner ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
            "transition-all duration-500 ease-out",
          ].join(" ")}
        >
          <button
            type="button"
            onClick={() => setIsRatingModalOpen(true)}
            className="pointer-events-auto w-full max-w-sm rounded-full bg-[#0F9E90] px-3 py-2 text-[12px] font-semibold text-white shadow-lg shadow-emerald-900/20 ring-1 ring-[#0C8A7E]/60 hover:bg-[#0C8A7E] focus:outline-none focus:ring-2 focus:ring-[#0F9E90]/70 md:max-w-xs md:rounded-2xl"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <span>飲んだことがありますか？</span>
              <span className="text-[10px] font-normal text-emerald-50">
                かんたん評価を送る
              </span>
            </span>
          </button>
        </div>
      )}

      {/* 評価モーダル */}
      {isRatingModalOpen && detail && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white px-5 py-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#0F172A]">
                  このプロテインを評価する
                </h2>
                <p className="mt-1 text-[11px] text-[#64748B]">
                  飲んだことがあれば気軽に評価してみよう。感覚で大丈夫です
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRatingModalOpen(false)}
                className="text-[18px] leading-none text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>

            <div className="mt-3 space-y-3 text-xs text-[#0F172A]">
              {[
                { key: "taste", label: "味のおいしさ" },
                { key: "mixability", label: "混ざりやすさ" },
                { key: "costPerformance", label: "コスパ" },
                { key: "repeatIntent", label: "リピート意向" },
                { key: "foam", label: "泡立ち" },
              ].map((item) => (
                <div key={item.key} className="flex items-center gap-2">
                  <span className="w-24 text-[10px] text-[#64748B]">
                    {item.label}
                  </span>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      disabled={saving}
                      onClick={() =>
                        setMyRating((prev) => ({
                          ...prev,
                          [item.key]: v,
                        }))
                      }
                      className="text-base leading-none text-[#F59E0B]"
                    >
                      {myRating[item.key as keyof MyQuickRating] >= v ? "★" : "☆"}
                    </button>
                  ))}
                </div>
              ))}

              {[
                {
                  key: "sweetness",
                  label: "甘さ",
                  left: "控えめ",
                  right: "しっかり甘め",
                },
                {
                  key: "richness",
                  label: "味の濃さ",
                  left: "さっぱり",
                  right: "しっかり濃い",
                },
                {
                  key: "milkFeel",
                  label: "ミルク感",
                  left: "あっさり",
                  right: "ミルク感強め",
                },
                {
                  key: "artificialSweetener",
                  label: "人工甘味料感",
                  left: "ほとんど感じない",
                  right: "強く感じる",
                },
              ].map((item) => (
                <div key={item.key} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-[#64748B]">
                    <span>{item.label}</span>
                    <span className="text-[9px]">
                      {item.left} ↔ {item.right}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    disabled={saving}
                    value={myRating[item.key as keyof MyQuickRating] ?? 3}
                    onChange={(e) =>
                      setMyRating((prev) => ({
                        ...prev,
                        [item.key]: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-[#0F9E90]"
                  />
                </div>
              ))}

              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  await saveQuickRating(detail.id)
                  setIsRatingModalOpen(false)
                }}
                className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-[#0F9E90] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#0C8A7E] disabled:opacity-60"
              >
                この内容で評価を送信
              </button>
              {saving && (
                <p className="text-[10px] text-[#94A3B8]">保存中です...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* フッター */}
      <footer className="mt-12 border-t border-slate-200 bg-[#0F172A] text-slate-100">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 text-xs text-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-teal-200">
                PROTEIN LOG
              </p>
              <p className="text-[11px] text-slate-300">
                口コミとデータで比較できるプロテイン専用レビューサービス
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-slate-300">
              <span>ブランド一覧</span>
              <span>商品一覧</span>
              <span>レビューについて</span>
            </div>
          </div>
          <div className="text-[10px] text-slate-400">
            &copy; {new Date().getFullYear()} Protein Log
          </div>
        </div>
      </footer>
    </div>
  )
}
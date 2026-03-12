'use client'

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { supabase } from "../../../lib/supabase"

type ClassifiedDetail = {
  id: string
  manufacturer: string | null
  product_name: string | null
  flavor: string | null
  price_jpy: number | null
  protein_grams_per_serving: number | null
  calories: number | null
  carbs: number | null
  fat: number | null
  price_per_kg: number | null
  product_url: string | null
  product_image_url: string | null
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
    sweetness: 45,           // 甘さ
    richness: 55,            // 味の濃さ
    milkFeel: 40,            // ミルク感
    artificialSweetener: 35, // 人工甘味料感
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
    // 集計
    const { data, error } = await supabase
      .from("product_quick_ratings")
      .select(
        "taste, mixability, cost_performance, repeat_intent, foam, sweetness, richness, milk_feel, artificial_sweetener, client_token"
      )
      .eq("product_result_id", productId)

    if (error) {
      console.error("failed to load quick ratings", error)
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
          "id, manufacturer, product_name, flavor, price_jpy, price_per_kg, protein_grams_per_serving, calories, carbs, fat, product_url, product_image_url, confidence"
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
        confidence:
          typeof row.confidence === "number" ? (row.confidence as number) : null
      }
      setDetail(mapped)
      await loadQuickRatings(mapped.id)
      setLoading(false)
    }

    load()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-white px-4 py-10 text-gray-900">
        <main className="mx-auto flex max-w-4xl flex-col gap-6">
          <p className="text-xs text-gray-500">読み込み中です...</p>
        </main>
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen bg-white px-4 py-10 text-gray-900">
        <main className="mx-auto flex max-w-3xl flex-col gap-8">
          <header className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                商品が見つかりませんでした
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                URL を確認するか、トップページから選び直してください。
              </p>
              {error && (
                <p className="mt-2 text-xs text-red-500">
                  エラー詳細: {error}
                </p>
              )}
            </div>
            <Link
              href="/"
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-gray-400 hover:bg-gray-50"
            >
              トップに戻る
            </Link>
          </header>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white px-4 py-10 text-gray-900">
      <main className="mx-auto flex max-w-4xl flex-col gap-10">
        <header className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
              Protein Detail
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              {detail.product_name ?? "名称不明のプロテイン"}
            </h1>
            <p className="text-sm text-gray-500">
              {detail.manufacturer ?? "メーカー不明"}
              {detail.flavor ? ` ・ ${detail.flavor}` : ""}
            </p>
          </div>
          <Link
            href="/"
            className="self-start rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-gray-400 hover:bg-gray-50"
          >
            トップに戻る
          </Link>
        </header>

        <section className="grid gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-2xl border bg-white px-6 py-6 flex items-center justify-center">
              {detail.product_image_url ? (
                <img
                  src={detail.product_image_url}
                  alt={detail.product_name ?? "protein"}
                  className="max-h-64 w-full object-contain"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-56 w-full items-center justify-center text-xs text-gray-400 bg-gray-50 rounded-xl">
                  画像はまだ登録されていません
                </div>
              )}
            </div>
            <div className="rounded-2xl border bg-white px-4 py-3 text-xs text-gray-700">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                    1kgあたりの参考価格
                  </dt>
                  <dd className="mt-1 font-medium">
                    {detail.price_per_kg != null
                      ? `約 ¥${Math.round(detail.price_per_kg).toLocaleString()} / kg`
                      : detail.price_jpy != null
                      ? `¥${detail.price_jpy.toLocaleString()}（総額）`
                      : "不明"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                    1食あたりタンパク質
                  </dt>
                  <dd className="mt-1 font-medium">
                    {detail.protein_grams_per_serving != null
                      ? `${detail.protein_grams_per_serving} g`
                      : "不明"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                    1食あたりカロリー
                  </dt>
                  <dd className="mt-1 font-medium">
                    {detail.calories != null ? `${detail.calories} kcal` : "不明"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                    1食あたり糖質
                  </dt>
                  <dd className="mt-1 font-medium">
                    {detail.carbs != null ? `${detail.carbs} g` : "不明"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                    1食あたり脂質
                  </dt>
                  <dd className="mt-1 font-medium">
                    {detail.fat != null ? `${detail.fat} g` : "不明"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                    商品ページ
                  </dt>
                  <dd className="mt-1">
                    {detail.product_url ? (
                      <a
                        href={detail.product_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-600 underline"
                      >
                        メーカー / ショップのページを開く
                      </a>
                    ) : (
                      <span className="text-gray-400 text-[11px]">
                        URL 情報はまだ登録されていません
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="space-y-4">
            {/* 1. みんなの評価（閲覧用カード） */}
            <div className="rounded-2xl border bg-white px-4 py-4 text-xs text-gray-700">
              <h2 className="text-sm font-semibold text-gray-900">
                みんなの評価
              </h2>
              <p className="mt-1 text-[11px] text-gray-500">
                ログインなしで集めた、全体の傾向です。
              </p>
              <div className="mt-2 space-y-1 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] text-gray-500">味のおいしさ</span>
                  <span className="text-amber-500">
                    {summary.avgTaste != null
                      ? "★".repeat(Math.round(summary.avgTaste)).padEnd(5, "☆")
                      : "☆☆☆☆☆"}
                  </span>
                  {summary.avgTaste != null && (
                    <span className="text-[10px] text-gray-500">
                      {summary.avgTaste.toFixed(1)} / 5.0
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] text-gray-500">混ざりやすさ</span>
                  <span className="text-amber-500">
                    {summary.avgMixability != null
                      ? "★"
                          .repeat(Math.round(summary.avgMixability))
                          .padEnd(5, "☆")
                      : "☆☆☆☆☆"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] text-gray-500">コスパ</span>
                  <span className="text-amber-500">
                    {summary.avgCostPerformance != null
                      ? "★"
                          .repeat(Math.round(summary.avgCostPerformance))
                          .padEnd(5, "☆")
                      : "☆☆☆☆☆"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] text-gray-500">リピート意向</span>
                  <span className="text-amber-500">
                    {summary.avgRepeatIntent != null
                      ? "★"
                          .repeat(Math.round(summary.avgRepeatIntent))
                          .padEnd(5, "☆")
                      : "☆☆☆☆☆"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] text-gray-500">泡立ち</span>
                  <span className="text-amber-500">
                    {summary.avgFoam != null
                      ? "★".repeat(Math.round(summary.avgFoam)).padEnd(5, "☆")
                      : "☆☆☆☆☆"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] text-gray-500">甘さ</span>
                  <span className="text-pink-500">
                    {summary.avgSweetness != null
                      ? "◆"
                          .repeat(Math.round(summary.avgSweetness))
                          .padEnd(5, "◇")
                      : "◇◇◇◇◇"}
                  </span>
                  {summary.avgSweetness != null && (
                    <span className="text-[10px] text-gray-500">
                      {summary.avgSweetness.toFixed(1)} / 5.0
                    </span>
                  )}
                </div>
                {summary.count > 0 && (
                  <p className="mt-1 text-[10px] text-gray-400">
                    {summary.count} 件の簡易評価が集まっています。
                  </p>
                )}
              </div>
            </div>

            {/* 2. あなたの評価（入力用カード） */}
            <div className="rounded-2xl border bg-white px-4 py-4 text-xs text-gray-700">
              <h2 className="text-sm font-semibold text-gray-900">
                あなたの評価
              </h2>
              <p className="mt-1 text-[11px] text-gray-500">
                飲んだことがあれば、感覚で構わないので教えてください。
              </p>
              <div className="mt-2 space-y-3">
                {/* レーダー5軸を星評価で */}
                {[
                  { key: "taste", label: "味のおいしさ" },
                  { key: "mixability", label: "混ざりやすさ" },
                  { key: "costPerformance", label: "コスパ" },
                  { key: "repeatIntent", label: "リピート意向" },
                  { key: "foam", label: "泡立ち" },
                ].map((item) => (
                  <div key={item.key} className="flex items-center gap-2">
                    <span className="w-24 text-[10px] text-gray-500">
                      {item.label}
                    </span>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        disabled={saving || !detail}
                        onClick={() =>
                          setMyRating((prev) => ({
                            ...prev,
                            [item.key]: v,
                          }))
                        }
                        className="text-base leading-none"
                      >
                        {myRating[item.key as keyof MyQuickRating] >= v
                          ? "★"
                          : "☆"}
                      </button>
                    ))}
                  </div>
                ))}

                {/* 好み4軸をバーで（1〜5） */}
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
                  <div key={item.key} className="flex items-center gap-3">
                    <span className="w-24 text-[10px] text-gray-500">
                      {item.label}
                    </span>
                    <div className="flex-1">
                      <div className="flex justify-between text-[9px] text-gray-400 mb-0.5">
                        <span>{item.left}</span>
                        <span>{item.right}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        step={1}
                        disabled={saving || !detail}
                        value={
                          myRating[item.key as keyof MyQuickRating] ?? 3
                        }
                        onChange={(e) =>
                          setMyRating((prev) => ({
                            ...prev,
                            [item.key]: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-gray-800"
                      />
                    </div>
                  </div>
                ))}

                <button
                  disabled={saving || !detail}
                  onClick={() => detail && saveQuickRating(detail.id)}
                  className="mt-2 inline-flex w-full items-center justify-center rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[11px] text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-60"
                >
                  この内容で評価を送信
                </button>
                {saving && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    保存中です...
                  </p>
                )}
              </div>
            </div>

            {/* 3. 味のバランス（説明用カード） */}
            <div className="rounded-2xl border bg-white px-4 py-4 text-xs text-gray-700">
              <h2 className="text-sm font-semibold text-gray-900">
                レーダーチャート（ユーザー評価イメージ）
              </h2>
              <p className="mt-1 text-[11px] text-gray-500">
                「味のおいしさ」「混ざりやすさ」「コスパ」「リピート意向」「泡立ち」の
                5つの観点で、全体的なバランスをイメージ表示しています。
                将来的には実際のレビューから集計した値を反映します。
              </p>
              <div className="mt-2 flex justify-center">
                <RadarChart metrics={metrics} />
              </div>
            </div>

            <div className="rounded-2xl border bg-white px-4 py-4 text-xs text-gray-700 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  みんなの評価
                </h2>
                <p className="mt-1 text-[11px] text-gray-500">
                  ログインなしで、気軽に「おいしさ」と「甘さ」を評価できます。
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-700">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-500">味のおいしさ</span>
                    <span className="text-amber-500">
                      {summary.avgTaste != null
                        ? "★".repeat(Math.round(summary.avgTaste)).padEnd(5, "☆")
                        : "☆☆☆☆☆"}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {summary.avgTaste != null
                        ? `${summary.avgTaste.toFixed(1)} / 5.0`
                        : "まだ評価がありません"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-500">混ざりやすさ</span>
                    <span className="text-amber-500">
                      {summary.avgMixability != null
                        ? "★"
                            .repeat(Math.round(summary.avgMixability))
                            .padEnd(5, "☆")
                        : "☆☆☆☆☆"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-500">コスパ</span>
                    <span className="text-amber-500">
                      {summary.avgCostPerformance != null
                        ? "★"
                            .repeat(Math.round(summary.avgCostPerformance))
                            .padEnd(5, "☆")
                        : "☆☆☆☆☆"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-500">リピート意向</span>
                    <span className="text-amber-500">
                      {summary.avgRepeatIntent != null
                        ? "★"
                            .repeat(Math.round(summary.avgRepeatIntent))
                            .padEnd(5, "☆")
                        : "☆☆☆☆☆"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-500">泡立ち</span>
                    <span className="text-amber-500">
                      {summary.avgFoam != null
                        ? "★".repeat(Math.round(summary.avgFoam)).padEnd(5, "☆")
                        : "☆☆☆☆☆"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-500">甘さ</span>
                    <span className="text-pink-500">
                      {summary.avgSweetness != null
                        ? "◆"
                            .repeat(Math.round(summary.avgSweetness))
                            .padEnd(5, "◇")
                        : "◇◇◇◇◇"}
                    </span>
                    {summary.avgSweetness != null && (
                      <span className="text-[10px] text-gray-500">
                        {summary.avgSweetness.toFixed(1)} / 5.0
                      </span>
                    )}
                  </div>
                  {summary.count > 0 && (
                    <span className="text-[10px] text-gray-400">
                      {summary.count} 件の簡易評価
                    </span>
                  )}
                </div>
              </div>

              <div className="border-t pt-3">
                <h2 className="text-sm font-semibold text-gray-900">
                  あなたの評価
                </h2>
                <p className="mt-1 text-[11px] text-gray-500">
                  感覚で構わないので、飲んだことがあれば一言評価をお願いします。
                </p>
                <div className="mt-2 space-y-3">
                  {/* レーダー5軸を星評価で */}
                  {[
                    { key: "taste", label: "味のおいしさ" },
                    { key: "mixability", label: "混ざりやすさ" },
                    { key: "costPerformance", label: "コスパ" },
                    { key: "repeatIntent", label: "リピート意向" },
                    { key: "foam", label: "泡立ち" },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center gap-2">
                      <span className="w-24 text-[10px] text-gray-500">
                        {item.label}
                      </span>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <button
                          key={v}
                          disabled={saving || !detail}
                          onClick={() =>
                            setMyRating((prev) => ({
                              ...prev,
                              [item.key]: v,
                            }))
                          }
                          className="text-base leading-none"
                        >
                          {myRating[item.key as keyof MyQuickRating] >= v
                            ? "★"
                            : "☆"}
                        </button>
                      ))}
                    </div>
                  ))}

                  {/* 好み4軸をバーで（1〜5） */}
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
                    <div key={item.key} className="flex items-center gap-3">
                      <span className="w-24 text-[10px] text-gray-500">
                        {item.label}
                      </span>
                      <div className="flex-1">
                        <div className="flex justify-between text-[9px] text-gray-400 mb-0.5">
                          <span>{item.left}</span>
                          <span>{item.right}</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          step={1}
                          disabled={saving || !detail}
                          value={
                            myRating[item.key as keyof MyQuickRating] ?? 3
                          }
                          onChange={(e) =>
                            setMyRating((prev) => ({
                              ...prev,
                              [item.key]: Number(e.target.value),
                            }))
                          }
                          className="w-full accent-gray-800"
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    disabled={saving || !detail}
                    onClick={() => detail && saveQuickRating(detail.id)}
                    className="mt-2 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[11px] text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-60"
                  >
                    この内容で評価を送信
                  </button>
                  {saving && (
                    <p className="text-[10px] text-gray-400">保存中です...</p>
                  )}
                </div>
              </div>

              <h2 className="text-sm font-semibold text-gray-900">
                味のバランス（好みが分かれるポイント）
              </h2>
              <p className="mt-1 text-[11px] text-gray-500">
                甘さ・味の濃さ・ミルク感・人工甘味料感など、好みが分かれる要素を
                左右のバーでイメージ表示しています。
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="w-20 text-[10px] text-gray-500">甘さ</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-[9px] text-gray-400 mb-0.5">
                      <span>控えめ</span>
                      <span>しっかり甘め</span>
                    </div>
                    <div className="relative h-2 rounded-full bg-gray-200">
                      <div
                        className="absolute h-2 rounded-full bg-pink-400"
                        style={{ width: `${preferenceLevels.sweetness}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-20 text-[10px] text-gray-500">味の濃さ</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-[9px] text-gray-400 mb-0.5">
                      <span>さっぱり</span>
                      <span>しっかり濃い</span>
                    </div>
                    <div className="relative h-2 rounded-full bg-gray-200">
                      <div
                        className="absolute h-2 rounded-full bg-emerald-400"
                        style={{ width: `${preferenceLevels.richness}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-20 text-[10px] text-gray-500">ミルク感</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-[9px] text-gray-400 mb-0.5">
                      <span>あっさり</span>
                      <span>ミルク感強め</span>
                    </div>
                    <div className="relative h-2 rounded-full bg-gray-200">
                      <div
                        className="absolute h-2 rounded-full bg-sky-400"
                        style={{ width: `${preferenceLevels.milkFeel}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-20 text-[10px] text-gray-500">
                    人工甘味料感
                  </span>
                  <div className="flex-1">
                    <div className="flex justify-between text-[9px] text-gray-400 mb-0.5">
                      <span>ほとんど感じない</span>
                      <span>強く感じる</span>
                    </div>
                    <div className="relative h-2 rounded-full bg-gray-200">
                      <div
                        className="absolute h-2 rounded-full bg-violet-400"
                        style={{ width: `${preferenceLevels.artificialSweetener}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              口コミレビュー（サンプル）
            </h2>
            <span className="text-[10px] text-gray-400">
              将来的には実際のユーザー投稿をここに表示します。
            </span>
          </div>
          <div className="space-y-3 rounded-2xl border bg-white px-4 py-3 text-xs text-gray-700">
            {dummyReviews.map((r) => (
              <article key={r.id} className="border-b border-gray-100 pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold text-gray-900">
                    {r.title}
                  </h3>
                  <span className="text-[10px] text-gray-400">
                    {r.created_at} ・ {r.nickname}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed">{r.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}


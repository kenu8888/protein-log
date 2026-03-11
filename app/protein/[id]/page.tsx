'use client'

import Link from "next/link"
import { useMemo } from "react"

type RadarMetrics = {
  taste: number
  sweetness: number
  mixability: number
  clumpiness: number
}

type ProteinDetail = {
  id: string
  title: string
  brand: string
  flavor: string
  imageUrl: string
  calories: string
  pricePerKg: string
  rating: number
  reviewCount: number
  description: string
  metrics: RadarMetrics
}

const proteinDetails: ProteinDetail[] = [
  {
    id: "amazon-top",
    title: "インパクトホエイ プロテイン",
    brand: "MyProtein",
    flavor: "ナチュラルチョコレート",
    imageUrl:
      "https://images.pexels.com/photos/11313342/pexels-photo-11313342.jpeg?auto=compress&cs=tinysrgb&w=800",
    calories: "110 kcal / 1杯(30g)",
    pricePerKg: "約 ¥2,300 / kg",
    rating: 4.6,
    reviewCount: 1250,
    description:
      "コスパと味のバランスに優れた定番ホエイプロテイン。日常使いに向いた、クセの少ないチョコレートフレーバーです。",
    metrics: {
      taste: 4.5,
      sweetness: 3.5,
      mixability: 4.2,
      clumpiness: 1.5
    }
  },
  {
    id: "trending",
    title: "クリアホエイ アイソレート",
    brand: "MyProtein",
    flavor: "ピーチティー",
    imageUrl:
      "https://images.pexels.com/photos/6456274/pexels-photo-6456274.jpeg?auto=compress&cs=tinysrgb&w=800",
    calories: "85 kcal / 1杯(25g)",
    pricePerKg: "約 ¥3,200 / kg",
    rating: 4.4,
    reviewCount: 860,
    description:
      "ジュース感覚で飲める透明系プロテイン。運動後でもさっぱり飲みやすく、乳感が苦手な方にもおすすめです。",
    metrics: {
      taste: 4.3,
      sweetness: 3.0,
      mixability: 4.5,
      clumpiness: 1.2
    }
  },
  {
    id: "most-reviewed",
    title: "ゴールドスタンダード 100%ホエイ",
    brand: "Optimum Nutrition",
    flavor: "ダブルリッチチョコレート",
    imageUrl:
      "https://images.pexels.com/photos/1552102/pexels-photo-1552102.jpeg?auto=compress&cs=tinysrgb&w=800",
    calories: "120 kcal / 1杯(30g)",
    pricePerKg: "約 ¥3,800 / kg",
    rating: 4.8,
    reviewCount: 2140,
    description:
      "世界中で愛されている王道ホエイプロテイン。しっかり濃いチョコレート感と、安定した溶けやすさが特徴です。",
    metrics: {
      taste: 4.8,
      sweetness: 3.8,
      mixability: 4.7,
      clumpiness: 1.0
    }
  }
]

function RadarChart({ metrics }: { metrics: RadarMetrics }) {
  const size = 180
  const center = size / 2
  const radius = 64
  const keys: (keyof RadarMetrics)[] = [
    "taste",
    "sweetness",
    "mixability",
    "clumpiness"
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

export default function ProteinDetailPage({
  params
}: {
  params: { id: string }
}) {
  const protein = proteinDetails.find((p) => p.id === params.id)

  if (!protein) {
    return (
      <div className="min-h-screen bg-white px-4 py-10 text-gray-900">
        <main className="mx-auto flex max-w-3xl flex-col gap-8">
          <header className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                プロテインが見つかりませんでした
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                URL を確認するか、トップページから選び直してください。
              </p>
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
              {protein.title}
            </h1>
            <p className="text-sm text-gray-500">
              {protein.brand} ・ {protein.flavor}
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
              <span className="text-amber-500">
                {"★".repeat(Math.round(protein.rating)).padEnd(5, "☆")}
              </span>
              <span>
                {protein.rating.toFixed(1)} / 5.0 ・ レビュー件数{" "}
                {protein.reviewCount.toLocaleString()} 件
              </span>
            </div>
          </div>
          <Link
            href="/"
            className="self-start rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-gray-400 hover:bg-gray-50"
          >
            トップに戻る
          </Link>
        </header>

        <section className="grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border bg-gray-100">
              <img
                src={protein.imageUrl}
                alt={`${protein.brand} ${protein.flavor}`}
                className="h-64 w-full object-cover"
              />
            </div>
            <div className="rounded-2xl border bg-white px-4 py-3 text-xs text-gray-700">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                    カロリー
                  </dt>
                  <dd className="mt-1 font-medium">{protein.calories}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                    1kgあたりの目安価格
                  </dt>
                  <dd className="mt-1 font-medium">{protein.pricePerKg}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                    ブランド
                  </dt>
                  <dd className="mt-1">{protein.brand}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                    フレーバー
                  </dt>
                  <dd className="mt-1">{protein.flavor}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-2xl border bg-white px-4 py-3 text-xs text-gray-700">
              <h2 className="text-sm font-semibold text-gray-900">
                このプロテインについて
              </h2>
              <p className="mt-2 leading-relaxed">{protein.description}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border bg-white px-4 py-4">
              <h2 className="text-sm font-semibold text-gray-900">
                レーダーチャート（ユーザー評価）
              </h2>
              <p className="mt-1 text-[11px] text-gray-500">
                味の好みや甘さ、溶けやすさ、ダマになりやすさをまとめたイメージです。
              </p>
              <div className="mt-2 flex justify-center">
                <RadarChart metrics={protein.metrics} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-600">
                <div>
                  <span className="font-semibold text-gray-800">味の満足度</span>
                  <span className="ml-1">
                    {protein.metrics.taste.toFixed(1)} / 5
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-gray-800">甘さ</span>
                  <span className="ml-1">
                    {protein.metrics.sweetness.toFixed(1)} / 5
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-gray-800">
                    溶けやすさ
                  </span>
                  <span className="ml-1">
                    {protein.metrics.mixability.toFixed(1)} / 5
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-gray-800">
                    ダマになりにくさ
                  </span>
                  <span className="ml-1">
                    {(5 - protein.metrics.clumpiness).toFixed(1)} / 5
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}


'use client'

import Link from "next/link"
import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

// domain types that match the database schema

type Brand = {
  id: string
  name: string
  country: string
}

type Product = {
  id: string
  name: string
  brand_id: string
}

type Flavor = {
  id: string
  product_id: string
  flavor_name: string
}

type Review = {
  id: string
  flavor_id: string
  rating: number
  sweetness: number
  mixability: number
  review_text: string
}

type FeaturedProtein = {
  id: string
  title: string
  brand: string
  flavor: string
  imageUrl: string
  calories: string
  pricePerKg: string
  badge: string
  rating: number
}

const featuredProteins: FeaturedProtein[] = [
  {
    id: "amazon-top",
    title: "インパクトホエイ プロテイン",
    brand: "MyProtein",
    flavor: "ナチュラルチョコレート",
    imageUrl:
      "https://images.pexels.com/photos/11313342/pexels-photo-11313342.jpeg?auto=compress&cs=tinysrgb&w=800",
    calories: "110 kcal / 1杯(30g)",
    pricePerKg: "約 ¥2,300 / kg",
    badge: "Amazonランキング TOP",
    rating: 4.6
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
    badge: "急上昇プロテイン",
    rating: 4.4
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
    badge: "当サイトレビュー最多",
    rating: 4.8
  }
]

const flavorTypeOptions = [
  "コーヒー系",
  "チョコ系",
  "フルーツ系",
  "ミルク系",
  "お菓子系"
] as const

const priceTierOptions = ["低価格帯", "中価格帯", "高価格帯"] as const

export default function Page() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [flavors, setFlavors] = useState<Flavor[]>([])
  const [reviews, setReviews] = useState<Review[]>([])

  const [selectedBrand, setSelectedBrand] = useState<string>("")
  const [selectedProduct, setSelectedProduct] = useState<string>("")
  const [selectedFlavor, setSelectedFlavor] = useState<string>("")
  const [message, setMessage] = useState<string>("")

  const [sweetnessLevel, setSweetnessLevel] = useState<number>(50)
  const [selectedFlavorTypes, setSelectedFlavorTypes] = useState<string[]>([])
  const [selectedPriceTiers, setSelectedPriceTiers] = useState<string[]>([])

  useEffect(() => {
    loadBrands()
  }, [])

  async function loadBrands() {
    const { data, error } = await supabase.from("brands").select("*")
    if (error) {
      setMessage("brandsの取得でエラー")
      console.error(error)
      return
    }
    if (data) setBrands(data)
  }

  async function loadProducts(brandId: string, brandName: string) {
    setSelectedBrand(brandName)
    setSelectedProduct("")
    setSelectedFlavor("")
    setReviews([])
    setMessage(`選択: ${brandName}`)

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("brand_id", brandId)

    if (error) {
      setMessage("productsの取得でエラー")
      console.error(error)
      return
    }
    if (data) {
      setProducts(data)
      setMessage(
        data.length === 0
          ? `${brandName} の商品が0件です`
          : `${brandName} の商品を表示しました`
      )
    }
  }

  async function loadFlavors(productId: string, productName: string) {
    setSelectedProduct(productName)
    setSelectedFlavor("")
    setReviews([])
    setMessage(`選択: ${productName}`)

    const { data, error } = await supabase
      .from("flavors")
      .select("*")
      .eq("product_id", productId)

    if (error) {
      setMessage("flavorsの取得でエラー")
      console.error(error)
      return
    }
    if (data) {
      setFlavors(data)
      setMessage(
        data.length === 0
          ? `${productName} のフレーバーが0件です`
          : `${productName} のフレーバーを表示しました`
      )
    }
  }

  async function loadReviews(flavorId: string, flavorName: string) {
    setSelectedFlavor(flavorName)
    setMessage(`選択: ${flavorName}`)

    const { data, error } = await supabase
      .from("reviews")
      .select("*")
      .eq("flavor_id", flavorId)

    if (error) {
      setMessage("reviewsの取得でエラー")
      console.error(error)
      return
    }
    if (data) {
      setReviews(data)
      setMessage(
        data.length === 0
          ? `${flavorName} のレビューが0件です`
          : `${flavorName} のレビューを表示しました`
      )
    }
  }

  return (
    <div className="min-h-screen bg-white px-4 py-10 text-gray-900">
      <main className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="flex flex-col gap-4 border-b pb-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                プロテインログ
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                多すぎるプロテインの最新情報と、あなたにぴったりのプロテイン探しのためのレビュー型データベース。
              </p>
            </div>
            <div className="rounded-full border bg-gray-50 px-4 py-1 text-xs text-gray-600">
              MVP / Brands → Products → Flavors → Reviews
            </div>
          </div>
          {message && (
            <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="truncate">{message}</span>
            </div>
          )}
        </header>

        <section className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                PICK UP
              </h2>
              <p className="mt-1 text-base font-medium text-gray-900">
                アマゾンランキングTOP・急上昇プロテイン・レビュー最多プロテイン
              </p>
              <p className="mt-1 text-xs text-gray-500">
                今チェックしておきたい定番＆話題のプロテインをピックアップしました。
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {featuredProteins.map((item) => (
              <article
                key={item.id}
                className="flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm"
              >
                <Link href={`/protein/${item.id}`} className="flex flex-1 flex-col">
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                    <img
                      src={item.imageUrl}
                      alt={`${item.brand} ${item.flavor}`}
                      className="h-full w-full object-cover transition duration-700 hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-gray-800 shadow-sm">
                      {item.badge}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 px-3 py-3">
                    <div className="text-[11px] text-gray-500">
                      {item.brand} ・ {item.flavor}
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {item.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-1 text-[11px]">
                      <span className="text-amber-500">
                        {"★".repeat(Math.round(item.rating)).padEnd(5, "☆")}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {item.rating.toFixed(1)} / 5.0
                      </span>
                    </div>
                    <dl className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-gray-600">
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                          カロリー
                        </dt>
                        <dd className="mt-0.5 font-medium">{item.calories}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                          1kgあたり
                        </dt>
                        <dd className="mt-0.5 font-medium">
                          {item.pricePerKg}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </Link>
              </article>
            ))}
          </div>

          <div className="rounded-2xl border bg-gray-50/80 px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-700">
                  甘さ・味・価格帯でしぼりこみ（UI プロトタイプ）
                </p>
                <p className="text-[11px] text-gray-500">
                  スライダーとチェックボックスでおおよその条件感を決められるようにしています。
                </p>
              </div>
              <div className="flex flex-1 flex-col gap-3 text-[11px] md:flex-row md:items-center md:justify-end">
                <div className="flex flex-1 flex-col gap-1">
                  <span className="text-[10px] font-semibold text-gray-600">
                    甘さ
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">控えめ</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={sweetnessLevel}
                      onChange={(e) => setSweetnessLevel(Number(e.target.value))}
                      className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 accent-gray-800"
                    />
                    <span className="text-[10px] text-gray-500">甘い</span>
                  </div>
                </div>
                <div className="h-px w-full bg-gray-200 md:h-8 md:w-px" />
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-gray-600">
                    味の傾向
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {flavorTypeOptions.map((label) => (
                      <label
                        key={label}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-gray-700 hover:border-gray-400"
                      >
                        <input
                          type="checkbox"
                          className="h-2.5 w-2.5 rounded border-gray-300 text-gray-800"
                          checked={selectedFlavorTypes.includes(label)}
                          onChange={() =>
                            setSelectedFlavorTypes((prev) =>
                              prev.includes(label)
                                ? prev.filter((v) => v !== label)
                                : [...prev, label]
                            )
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="h-px w-full bg-gray-200 md:h-8 md:w-px" />
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-gray-600">
                    価格帯
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {priceTierOptions.map((label) => (
                      <label
                        key={label}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-gray-700 hover:border-gray-400"
                      >
                        <input
                          type="checkbox"
                          className="h-2.5 w-2.5 rounded border-gray-300 text-gray-800"
                          checked={selectedPriceTiers.includes(label)}
                          onChange={() =>
                            setSelectedPriceTiers((prev) =>
                              prev.includes(label)
                                ? prev.filter((v) => v !== label)
                                : [...prev, label]
                            )
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">
                  人気ブランド
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                  気になるブランドを選択してください。
              </p>
            </div>
            <div className="rounded-2xl border bg-white/80 p-4 shadow-sm">
              <ul className="space-y-2">
                {brands.map((b) => (
                  <li key={b.id}>
                    <button
                      onClick={() => loadProducts(b.id, b.name)}
                      className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm transition hover:border-gray-300 hover:bg-gray-50"
                    >
                      <span className="font-medium">{b.name}</span>
                      {b.country && (
                        <span className="text-xs text-gray-500">
                          {b.country}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
                {brands.length === 0 && (
                  <li className="text-xs text-gray-400">
                    ブランドがまだ登録されていません。
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">
                  人気の商品
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {selectedBrand
                  ? `${selectedBrand} の商品一覧です。`
                  : "ブランドを選ぶと商品が表示されます。"}
              </p>
            </div>
            <div className="rounded-2xl border bg-white/80 p-4 shadow-sm">
              <ul className="space-y-2">
                {products.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => loadFlavors(p.id, p.name)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm font-medium transition hover:border-gray-300 hover:bg-gray-50"
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
                {products.length === 0 && (
                  <li className="text-xs text-gray-400">
                    {selectedBrand
                      ? `${selectedBrand} の商品はまだ登録されていません。`
                      : "まずブランドを選択してください。"}
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">
                  人気のプロテイン
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {selectedProduct
                    ? `${selectedProduct} のフレーバーです。`
                    : "商品を選ぶとフレーバーが表示されます。"}
                </p>
              </div>
              <div className="rounded-2xl border bg-white/80 p-4 shadow-sm">
                <ul className="space-y-2">
                  {flavors.map((f) => (
                    <li key={f.id}>
                      <button
                        onClick={() => loadReviews(f.id, f.flavor_name)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm font-medium transition hover:border-gray-300 hover:bg-gray-50"
                      >
                        {f.flavor_name}
                      </button>
                    </li>
                  ))}
                  {flavors.length === 0 && (
                    <li className="text-xs text-gray-400">
                      {selectedProduct
                        ? `${selectedProduct} のフレーバーはまだ登録されていません。`
                        : "まず商品を選択してください。"}
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Reviews
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {selectedFlavor
                      ? `${selectedFlavor} のレビューです。`
                      : "フレーバーを選ぶとレビューが表示されます。"}
                  </p>
                </div>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border bg-white/80 p-4 shadow-sm">
                {reviews.length === 0 && (
                  <p className="text-xs text-gray-400">
                    {selectedFlavor
                      ? `${selectedFlavor} のレビューはまだ登録されていません。`
                      : "フレーバーを選択すると、ここにレビューが表示されます。"}
                  </p>
                )}
                {reviews.map((r) => (
                  <article
                    key={r.id}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
                      <span>
                        <span className="font-semibold text-gray-800">
                          Rating
                        </span>
                        : {r.rating}
                      </span>
                      <span>
                        <span className="font-semibold text-gray-800">
                          Sweetness
                        </span>
                        : {r.sweetness}
                      </span>
                      <span>
                        <span className="font-semibold text-gray-800">
                          Mixability
                        </span>
                        : {r.mixability}
                      </span>
                    </div>
                    {r.review_text && (
                      <p className="mt-2 text-[11px] leading-relaxed text-gray-700">
                        {r.review_text}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

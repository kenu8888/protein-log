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
  { value: "coffee", label: "コーヒー系", icon: "☕" },
  { value: "choco", label: "チョコ系", icon: "🍫" },
  { value: "fruit", label: "フルーツ系", icon: "🍓" },
  { value: "milk", label: "ミルク系", icon: "🥛" },
  { value: "sweets", label: "お菓子系", icon: "🍪" },
  { value: "meal", label: "食事系", icon: "🍽" },
  { value: "plain", label: "プレーン", icon: "◻︎" },
  { value: "yogurt", label: "ヨーグルト系", icon: "🥣" },
  { value: "matcha", label: "抹茶系", icon: "🍵" }
] as const

const priceTierOptions = ["低価格帯", "中価格帯", "高価格帯"] as const

type ClassifiedProtein = {
  id: string
  manufacturer: string | null
  product_name: string | null
  flavor: string | null
  price_jpy: number | null
  protein_grams_per_serving: number | null
  avg_rating: number | null
  price_per_kg: number | null
  flavor_category: string | null
  display_manufacturer: string | null
  display_product_name: string | null
  display_flavor: string | null
  product_url: string | null
  product_image_url: string | null
  confidence: number | null
}

type ClassifiedProtein = {
  id: string
  manufacturer: string | null
  product_name: string | null
  flavor: string | null
  price_jpy: number | null
  protein_grams_per_serving: number | null
  avg_rating: number | null
  price_per_kg: number | null
  flavor_category: string | null
  display_manufacturer: string | null
  display_product_name: string | null
  display_flavor: string | null
  product_url: string | null
  product_image_url: string | null
  confidence: number | null
}

function formatProductTitle(p: ClassifiedProtein): string {
  const manufacturer = (p.manufacturer ?? "").replace(/（[^）]*）/g, "").trim()
  const flavor = (p.flavor ?? "").trim()
  let name = (p.product_name ?? "").trim()

  if (!name && manufacturer && flavor) {
    return `${manufacturer} ${flavor}`
  }

  // 括弧内を削除
  name = name.replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "")

  // 容量・規格っぽい表記を削除（1kg, 1 kg, 1000g など）
  name = name.replace(/\d+(\.\d+)?\s*(kg|KG|ｋｇ|g|G|グラム|キロ)/g, "")
  // "100" 単体や "WPCプロテイン" など、ノイズになりがちなワードを削る
  name = name.replace(/\b100\b/g, "")
  name = name.replace(/WPCプロテイン?/gi, "")
  name = name.replace(/\s+/g, " ").trim()

  // 「ホエイ プロテイン」までを優先的に残す
  const proteinMatch = name.match(/.*?(ホエイ|ホエー)?\s*プロテイン/)
  let proteinPart = proteinMatch ? proteinMatch[0].trim() : ""

  // それでもなければ、先頭2〜3語だけ残す
  if (!proteinPart) {
    const words = name.split(" ")
    proteinPart = words.slice(0, 3).join(" ")
  }

  const parts: string[] = []
  if (manufacturer) parts.push(manufacturer)
  if (proteinPart) parts.push(proteinPart)
  if (flavor) parts.push(flavor)

  const result = parts.join(" ").trim()
  return result || name || manufacturer || "名称不明"
}

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
  const [searchQuery, setSearchQuery] = useState<string>("")

  const [classified, setClassified] = useState<ClassifiedProtein[]>([])
  const [classifiedMessage, setClassifiedMessage] = useState<string>("")
  const [proteinCount, setProteinCount] = useState<number | null>(null)

  useEffect(() => {
    loadBrands()
    loadClassifiedProteins()
    loadProteinCount()
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

  async function loadClassifiedProteins() {
    const { data, error } = await supabase
      .from("product_classification_results")
      .select(
        "id, manufacturer, product_name, flavor, price_jpy, protein_grams_per_serving, avg_rating, price_per_kg, flavor_category, display_manufacturer, display_product_name, display_flavor, product_url, product_image_url, confidence, is_protein_powder"
      )
      .eq("is_protein_powder", true)
      .order("created_at", { ascending: false })
      .limit(30)

    if (error) {
      console.error(error)
      setClassifiedMessage("プロテイン一覧の取得でエラーが発生しました。")
      return
    }

    if (!data || data.length === 0) {
      setClassified([])
      setClassifiedMessage("まだ登録されているプロテインがありません。")
      return
    }

    setClassified(
      data.map((row: any) => ({
        id: row.id as string,
        manufacturer: (row.manufacturer as string) ?? null,
        product_name: (row.product_name as string) ?? null,
        flavor: (row.flavor as string) ?? null,
        price_jpy:
          typeof row.price_jpy === "number" ? (row.price_jpy as number) : null,
        protein_grams_per_serving:
          typeof row.protein_grams_per_serving === "number"
            ? (row.protein_grams_per_serving as number)
            : null,
        avg_rating:
          typeof row.avg_rating === "number" ? (row.avg_rating as number) : null,
        price_per_kg:
          typeof row.price_per_kg === "number" ? (row.price_per_kg as number) : null,
        flavor_category: (row.flavor_category as string) ?? null,
        display_manufacturer: (row.display_manufacturer as string) ?? null,
        display_product_name: (row.display_product_name as string) ?? null,
        display_flavor: (row.display_flavor as string) ?? null,
        product_url: (row.product_url as string) ?? null,
        product_image_url: (row.product_image_url as string) ?? null,
        confidence:
          typeof row.confidence === "number" ? (row.confidence as number) : null
      }))
    )
    setClassifiedMessage("")
  }

  async function loadProteinCount() {
    const { count, error } = await supabase
      .from("product_classification_results")
      .select("id", { count: "exact", head: true })
      .eq("is_protein_powder", true)

    if (error) {
      console.error(error)
      return
    }

    setProteinCount(count ?? 0)
  }

  const filteredClassified = classified.filter((p) => {
    if (selectedFlavorTypes.length > 0) {
      const matchedFlavor = flavorTypeOptions.find(
        (f) => f.value === p.flavor_category
      )
      if (!matchedFlavor || !selectedFlavorTypes.includes(matchedFlavor.label)) {
        return false
      }
    }

    if (selectedPriceTiers.length > 0 && p.price_per_kg != null) {
      const price = p.price_per_kg
      const isLow = price < 2500
      const isMid = price >= 2500 && price <= 4000
      const isHigh = price > 4000

      if (
        !(
          (isLow && selectedPriceTiers.includes("低価格帯")) ||
          (isMid && selectedPriceTiers.includes("中価格帯")) ||
          (isHigh && selectedPriceTiers.includes("高価格帯"))
        )
      ) {
        return false
      }
    }

    return true
  })

  async function runVectorSearch() {
    const q = searchQuery.trim()
    if (!q) {
      // クエリが空なら通常の一覧に戻す
      await loadClassifiedProteins()
      return
    }

    setClassifiedMessage("検索中です…")

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query: q, limit: 30 })
      })

      if (!res.ok) {
        setClassifiedMessage("検索でエラーが発生しました。しばらくしてからお試しください。")
        return
      }

      const json = await res.json()
      const products = (json.products ?? []) as any[]

      setClassified(
        products.map((row: any) => ({
          id: row.id as string,
          manufacturer: (row.manufacturer as string) ?? null,
          product_name: (row.product_name as string) ?? null,
          flavor: (row.flavor as string) ?? null,
          price_jpy:
            typeof row.price_jpy === "number" ? (row.price_jpy as number) : null,
          protein_grams_per_serving:
            typeof row.protein_grams_per_serving === "number"
              ? (row.protein_grams_per_serving as number)
              : null,
          avg_rating:
            typeof row.avg_rating === "number" ? (row.avg_rating as number) : null,
          price_per_kg:
            typeof row.price_per_kg === "number"
              ? (row.price_per_kg as number)
              : null,
          flavor_category: (row.flavor_category as string) ?? null,
          display_manufacturer: (row.display_manufacturer as string) ?? null,
          display_product_name: (row.display_product_name as string) ?? null,
          display_flavor: (row.display_flavor as string) ?? null,
          product_url: (row.product_url as string) ?? null,
          product_image_url: (row.product_image_url as string) ?? null,
          confidence:
            typeof row.confidence === "number" ? (row.confidence as number) : null
        }))
      )

      if (!products.length) {
        setClassifiedMessage("該当するプロテインが見つかりませんでした。")
      } else {
        setClassifiedMessage("")
      }
    } catch (error) {
      console.error("runVectorSearch error", error)
      setClassifiedMessage("検索でエラーが発生しました。")
    }
  }

  return (
    <div className="min-h-screen bg-white px-4 py-10 text-gray-900">
      <main className="mx-auto flex max-w-5xl flex-col gap-12">
        <header className="flex flex-col gap-5 border-b pb-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                プロテインログ
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                あなたに合うプロテインが見つかる。プロテイン専用データベース。
              </p>
            </div>
            <div className="rounded-full border bg-gray-50 px-4 py-1 text-xs text-gray-600">
              登録プロテイン数{" "}
              <span className="font-semibold">
                {proteinCount != null ? proteinCount.toLocaleString() : "―"}
              </span>
              件
            </div>
          </div>
          {message && (
            <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="truncate">{message}</span>
            </div>
          )}
        </header>

        {/* 検索 + 絞り込み + 一覧 */}
        <section className="space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-emerald-700">
              口コミから、自分に合うプロテインが見つかる
            </p>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                  プロテインを探す
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  キーワード検索と絞り込みで、条件に合うプロテインを比較できます。
                </p>
              </div>
              <button
                onClick={loadClassifiedProteins}
                className="mt-2 self-start rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-gray-400 hover:bg-gray-50"
              >
                最新の情報を再読込
              </button>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border bg-white/90 p-4 shadow-sm">
            {/* 検索 */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-gray-600">
                  キーワード検索
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void runVectorSearch()
                    }
                  }}
                  placeholder="メーカー名・商品名・フレーバーで検索（Enterで検索）"
                  className="mt-1 w-full rounded-full border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
                />
              </div>
            </div>

            {/* 絞り込みバー */}
            <div className="rounded-2xl border bg-gray-50/80 px-3 py-3">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
                <div className="h-px w-full bg-gray-200 md:h-10 md:w-px" />
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-gray-600">
                    味の傾向
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {flavorTypeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setSelectedFlavorTypes((prev) =>
                            prev.includes(option.label)
                              ? prev.filter((v) => v !== option.label)
                              : [...prev, option.label]
                          )
                        }
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                          selectedFlavorTypes.includes(option.label)
                            ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                        }`}
                      >
                        <span>{option.icon}</span>
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-px w-full bg-gray-200 md:h-10 md:w-px" />
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-gray-600">
                    価格帯（1kgあたり）
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {priceTierOptions.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() =>
                          setSelectedPriceTiers((prev) =>
                            prev.includes(label)
                              ? prev.filter((v) => v !== label)
                              : [...prev, label]
                          )
                        }
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                          selectedPriceTiers.includes(label)
                            ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                        }`}
                      >
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 一覧表示 */}
          <div className="rounded-2xl border bg-white/80 p-4 shadow-sm">
            {classifiedMessage && (
              <p className="mb-2 text-xs text-gray-400">{classifiedMessage}</p>
            )}
            {classified.length === 0 && !classifiedMessage && (
              <p className="text-xs text-gray-400">
                まだ登録されているプロテインがありません。バッチ処理（`npm run daily:full`）実行後に反映されます。
              </p>
            )}
            {classified.length > 0 && filteredClassified.length === 0 && (
              <p className="text-xs text-gray-400">
                条件に合うプロテインが見つかりませんでした。検索条件をゆるめてみてください。
              </p>
            )}
            {filteredClassified.length > 0 && (
              <ul className="divide-y divide-gray-100 text-xs">
                {filteredClassified.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/evaluations/${p.id}`}
                      className="flex gap-3 py-3 hover:bg-gray-50 rounded-xl px-1 -mx-1 transition"
                    >
                      {p.product_image_url && (
                        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                          <img
                            src={p.product_image_url}
                            alt={p.product_name ?? "protein"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-semibold text-gray-900">
                            {p.display_product_name ?? p.product_name ?? "名称不明"}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {p.display_manufacturer ??
                              p.manufacturer ??
                              "メーカー不明"}
                            {(p.display_flavor ?? p.flavor) &&
                              ` ・ ${p.display_flavor ?? p.flavor}`}
                          </p>
                          {p.avg_rating != null && (
                            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-700">
                              <span className="text-amber-500 text-[11px]">
                                {"★"
                                  .repeat(Math.round(p.avg_rating))
                                  .padEnd(5, "☆")}
                              </span>
                              <span className="font-medium">
                                {p.avg_rating.toFixed(1)} / 5.0
                              </span>
                              <span className="text-gray-400">総合評価</span>
                            </div>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-gray-600">
                          {p.price_per_kg != null && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5">
                              <span className="font-semibold text-gray-800">
                                1kgあたり
                              </span>
                              : ¥{Math.round(p.price_per_kg).toLocaleString()}
                            </span>
                          )}
                          {p.price_per_kg == null && p.price_jpy != null && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5">
                              <span className="font-semibold text-gray-800">
                                価格（参考）
                              </span>
                              : ¥{p.price_jpy.toLocaleString()}
                            </span>
                          )}
                          {p.protein_grams_per_serving != null && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5">
                              1食あたり {p.protein_grams_per_serving} g
                            </span>
                          )}
                          {p.flavor_category && (
                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">
                              <span className="text-[9px] text-gray-600">
                                {p.flavor_category === "choco"
                                  ? "チョコ系"
                                  : p.flavor_category === "coffee"
                                  ? "コーヒー系"
                                  : p.flavor_category === "fruit"
                                  ? "フルーツ系"
                                  : p.flavor_category === "milk"
                                  ? "ミルク系"
                                  : p.flavor_category === "sweets"
                                  ? "お菓子系"
                                  : p.flavor_category === "meal"
                                  ? "食事系"
                                  : p.flavor_category === "plain"
                                  ? "プレーン"
                                  : p.flavor_category === "yogurt"
                                  ? "ヨーグルト系"
                                  : p.flavor_category === "matcha"
                                  ? "抹茶系"
                                  : "その他"}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* サイトの特徴 */}
          <div className="rounded-2xl border bg-gray-50/80 p-4 text-[11px] text-gray-700 space-y-1">
            <p>・忖度なしで全てのプロテイン情報をリサーチ</p>
            <p>・最新の各メーカープロテインフレーバー情報を毎日アップデート</p>
            <p>・口コミレビューからあなたに合うプロテインがきっと見つかる</p>
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
                人気商品
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {selectedBrand
                  ? `${selectedBrand} でよく飲まれている商品です。`
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
                  人気フレーバー
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {selectedProduct
                    ? `${selectedProduct} で人気のフレーバーです。`
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
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">
                  人気レビュー
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {selectedFlavor
                    ? `${selectedFlavor} のレビューです。`
                    : "フレーバーを選ぶとレビューが表示されます。"}
                </p>
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

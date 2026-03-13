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
  // 無機質な図形ベースのアイコン（モノクロ）
  { value: "coffee", label: "コーヒー系", icon: "●" },
  { value: "choco", label: "チョコ系", icon: "■" },
  { value: "fruit", label: "フルーツ系", icon: "◆" },
  { value: "milk", label: "ミルク系", icon: "▲" },
  { value: "sweets", label: "お菓子系", icon: "⬟" },
  { value: "meal", label: "食事系", icon: "▤" },
  { value: "plain", label: "プレーン", icon: "□" },
  { value: "yogurt", label: "ヨーグルト系", icon: "◍" },
  { value: "matcha", label: "抹茶系", icon: "△" }
] as const

const preferenceOptions = [
  { key: "sweetness", label: "甘さ" },
  { key: "richness", label: "味の濃さ" },
  { key: "milk_feel", label: "ミルク感" },
  { key: "artificial_sweetener", label: "人工甘味料感" }
] as const

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
  is_in_stock?: boolean | null
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

function formatProductUrlLabel(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname.includes("amazon.")) return "Amazon"
    if (u.hostname.includes("iherb.")) return "iHerb"
    if (u.hostname.includes("rakuten.") || u.hostname.includes("rakuten.co.jp"))
      return "楽天市場"
    return "メーカー"
  } catch {
    return null
  }
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
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>([])
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState<string>("")

  const [classified, setClassified] = useState<ClassifiedProtein[]>([])
  const [classifiedMessage, setClassifiedMessage] = useState<string>("")
  const [proteinCount, setProteinCount] = useState<number | null>(null)
  const [manufacturerCount, setManufacturerCount] = useState<number | null>(null)
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<
    "new" | "price" | "price_desc" | "popular" | "reviews"
  >("new")
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [listAnimating, setListAnimating] = useState<boolean>(false)

  const PAGE_SIZE = 10

  useEffect(() => {
    loadBrands()
    loadClassifiedProteins()
    loadProteinCount()
    loadManufacturerCount()
    loadLastUpdated()
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
        "id, manufacturer, product_name, flavor, price_jpy, protein_grams_per_serving, avg_rating, price_per_kg, flavor_category, display_manufacturer, display_product_name, display_flavor, product_url, product_image_url, confidence, is_in_stock, is_protein_powder"
      )
      .eq("is_protein_powder", true)
      .order("created_at", { ascending: false })

    if (error) {
      console.error(error)
      setClassifiedMessage("プロテイン一覧の取得でエラーが発生しました")
      return
    }

    if (!data || data.length === 0) {
      setClassified([])
      setClassifiedMessage("まだ登録されているプロテインがありません")
      setCurrentPage(1)
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
          typeof row.confidence === "number" ? (row.confidence as number) : null,
        is_in_stock:
          typeof row.is_in_stock === "boolean"
            ? (row.is_in_stock as boolean)
            : null,
      }))
    )
    setClassifiedMessage("")
    setCurrentPage(1)
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

  async function loadManufacturerCount() {
    const { count, error } = await supabase
      .from("manufacturer_sources")
      .select("id", { count: "exact", head: true })

    if (error) {
      console.error(error)
      return
    }

    setManufacturerCount(count ?? 0)
  }

  async function loadLastUpdated() {
    const { data, error } = await supabase
      .from("product_classification_results")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)

    if (error) {
      console.error(error)
      return
    }

    if (data && data.length > 0 && data[0]?.created_at) {
      const d = new Date(data[0].created_at as string)
      const formatted = d.toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
      setLastUpdatedLabel(formatted)
    } else {
      setLastUpdatedLabel(null)
    }
  }

  const filteredClassified = classified.filter((p) => {
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      const text = [
        p.display_manufacturer ?? p.manufacturer ?? "",
        p.display_product_name ?? p.product_name ?? "",
        p.display_flavor ?? p.flavor ?? "",
      ]
        .join(" ")
        .toLowerCase()
      if (!text.includes(q)) {
        return false
      }
    }

    if (selectedFlavorTypes.length > 0) {
      const matchedFlavor = flavorTypeOptions.find(
        (f) => f.value === p.flavor_category
      )
      if (!matchedFlavor || !selectedFlavorTypes.includes(matchedFlavor.label)) {
        return false
      }
    }

    if (selectedSources.length > 0) {
      const sources = p.source_names ?? []
      if (!sources.some((s) => selectedSources.includes(s))) {
        return false
      }
    }

    return true
  })

  const sortedClassified = [...filteredClassified]
  if (sortKey === "price") {
    sortedClassified.sort((a, b) => {
      const aPrice = a.price_per_kg ?? a.price_jpy ?? Number.POSITIVE_INFINITY
      const bPrice = b.price_per_kg ?? b.price_jpy ?? Number.POSITIVE_INFINITY
      return aPrice - bPrice
    })
  } else if (sortKey === "popular") {
    sortedClassified.sort((a, b) => {
      const aRating = a.avg_rating ?? -1
      const bRating = b.avg_rating ?? -1
      return bRating - aRating
    })
  }

  const totalPages =
    sortedClassified.length > 0
      ? Math.ceil(sortedClassified.length / PAGE_SIZE)
      : 1
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * PAGE_SIZE
  const paginatedClassified = sortedClassified.slice(
    startIndex,
    startIndex + PAGE_SIZE
  )

  // 並び替え / 絞り込み / ページ切り替え時に一覧をふわっと入れ替える
  useEffect(() => {
    setListAnimating(true)
    const id = requestAnimationFrame(() => {
      setListAnimating(false)
    })
    return () => cancelAnimationFrame(id)
  }, [classified, selectedFlavorTypes, selectedPreferences, selectedSources, sortKey, safePage, searchQuery])

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      {/* 1. フル幅ブランドバー（詳細ページと同デザイン） */}
      <header className="fixed inset-x-0 top-0 z-30 w-full bg-[#1F2A44] text-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-[0.18em] text-teal-200">
              PROTEIN LOG
            </span>
            <span className="hidden text-[11px] text-slate-200/80 sm:inline">
              あなたに合うプロテインが見つかる
            </span>
          </div>
          {/* ロゴ横のキーワード検索バー（詳細ページと同トーン） */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setCurrentPage(1)
            }}
            className="hidden items-center gap-2 sm:flex"
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="メーカー名・商品名・フレーバー検索"
              className="h-8 w-48 rounded-full border border-slate-500/60 bg-[#0F172A] px-3 text-[11px] text-slate-50 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none"
            />
          </form>
        </div>
      </header>

      {/* 2. フル幅ヒーローセクション（PC/SPで別背景画像を使用） */}
      {/* SP: hero-protein-mobile.png / PC: hero-protein-desktop.png */}
      <section className="relative mt-12 w-full min-h-[240px] bg-[#F8FAFC] bg-right bg-no-repeat bg-[length:cover] bg-[url('/hero-protein-mobile.png')] sm:mt-14 sm:bg-[url('/hero-protein-desktop.png')]">
        {/* テキスト可読性のためのオーバーレイ */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/85 via-white/75 to-white/30" />

        <div className="relative mx-auto flex h-full max-w-5xl flex-col gap-6 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          {/* 左: テキストエリア */}
          <div className="max-w-xl space-y-4">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500">
                プロテイン比較・口コミデータベース
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-[#1F2A44] sm:text-3xl">
                あなたに合うプロテインが見つかる
              </h1>
              <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">
                膨大にあるプロテイン情報を毎日更新し、
                <br />
                口コミとデータで比較できる「プロテイン専用のレビューサービス」です。
              </p>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById("search")
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                }}
                className="inline-flex items-center gap-1 rounded-[12px] bg-[#1F2A44] px-5 py-2 text-[11px] font-semibold text-white shadow-sm shadow-slate-900/10 hover:bg-[#111827]"
              >
                プロテインを探す
              </button>
              {proteinCount != null && (
                <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[10px] text-slate-700 ring-1 ring-slate-200/80">
                  <span className="text-slate-500">登録フレーバー</span>
                  <span className="text-xs font-semibold text-slate-900">
                    {proteinCount.toLocaleString()}
                  </span>
                  <span className="text-slate-400">件</span>
                </div>
              )}
            {manufacturerCount != null && (
              <Link
                href="/manufacturers"
                className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[10px] text-slate-700 ring-1 ring-slate-200/80 hover:bg-white"
              >
                <span className="text-slate-500">登録メーカー</span>
                <span className="text-xs font-semibold text-slate-900">
                  {manufacturerCount.toLocaleString()}
                </span>
                <span className="text-slate-400">社</span>
              </Link>
            )}
            </div>
            {lastUpdatedLabel && (
              <p className="mt-1 text-[9px] text-slate-400">
                最終更新 {lastUpdatedLabel}
              </p>
            )}
          </div>

          {/* 右側はスペーサーとしてのみ利用（背景画像はセクションに敷いている） */}
          <div className="mt-6 hidden flex-1 sm:block" />
        </div>
      </section>

      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
        {message && (
          <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-[10px] text-sky-800">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            <span className="truncate">{message}</span>
          </div>
        )}

        {/* 検索 + 絞り込み + 一覧 */}
        <section id="search" className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1F2A44]">
              プロテインを探す
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              絞り込みとキーワード検索を組み合わせて、条件に合うプロテインを比較できます。
            </p>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {/* 絞り込みバー */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 flex-col gap-1">
                  <span className="text-[10px] font-semibold text-slate-700">
                    甘さ
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">控えめ</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={sweetnessLevel}
                      onChange={(e) => setSweetnessLevel(Number(e.target.value))}
                      className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-[#1F2A44]"
                    />
                    <span className="text-[10px] text-slate-500">甘い</span>
                  </div>
                </div>
                <div className="h-px w-full bg-slate-200 md:h-10 md:w-px" />
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-slate-700">
                    フレーバー
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
                            ? "border-[#1F2A44] bg-[#1F2A44] text-white"
                            : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        <span>{option.icon}</span>
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-px w-full bg-slate-200 md:h-10 md:w-px" />
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-slate-700">
                    好みの傾向
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {preferenceOptions.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() =>
                          setSelectedPreferences((prev) => {
                            const next = prev.includes(opt.label)
                              ? prev.filter((v) => v !== opt.label)
                              : [...prev, opt.label]
                            setCurrentPage(1)
                            return next
                          })
                        }
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                          selectedPreferences.includes(opt.label)
                            ? "border-[#1F2A44] bg-[#1F2A44] text-white"
                            : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        <span className="text-[9px] opacity-70">●</span>
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* 検索条件クリア */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setSweetnessLevel(50)
                  setSelectedFlavorTypes([])
                  setSelectedPreferences([])
                  setSelectedSources([])
                  setSearchQuery("")
                  setSortKey("new")
                  setCurrentPage(1)
                  setClassifiedMessage("")
                  void loadClassifiedProteins()
                }}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] text-slate-700 hover:border-slate-300 hover:bg-slate-100"
              >
                検索条件をクリア
              </button>
            </div>
            {/* （キーワード検索バーはヘッダー内に移動） */}
          </div>

          {/* 一覧表示 */}
          <div
            className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 ease-out ${
              listAnimating
                ? "opacity-0 translate-y-1"
                : "opacity-100 translate-y-0"
            }`}
          >

            {classifiedMessage && (
              <p className="mb-2 text-xs text-gray-400">{classifiedMessage}</p>
            )}

            {classified.length > 0 && filteredClassified.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">並び替え</p>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setSortKey("new")}
                    className={`rounded-full px-3 py-1 ${
                      sortKey === "new"
                        ? "bg-[#1F2A44] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    新着順
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortKey("popular")}
                    className={`rounded-full px-3 py-1 ${
                      sortKey === "popular"
                        ? "bg-[#1F2A44] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    人気順
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortKey("price")}
                    className={`rounded-full px-3 py-1 ${
                      sortKey === "price"
                        ? "bg-[#1F2A44] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    安い順
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortKey("price_desc")}
                    className={`rounded-full px-3 py-1 ${
                      sortKey === "price_desc"
                        ? "bg-[#1F2A44] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    高い順
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortKey("reviews")}
                    className={`rounded-full px-3 py-1 ${
                      sortKey === "reviews"
                        ? "bg-[#1F2A44] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    口コミ件数順
                  </button>
                </div>
              </div>
            )}

            {classified.length === 0 && !classifiedMessage && (
              <p className="text-xs text-gray-400">
                まだ登録されているプロテインがありません バッチ処理（`npm run daily:full`）実行後に反映されます
              </p>
            )}
            {classified.length > 0 && filteredClassified.length === 0 && (
              <p className="text-xs text-gray-400">
                条件に合うプロテインが見つかりませんでした 検索条件をゆるめてみてください
              </p>
            )}
            {sortedClassified.length > 0 && (
              <ul className="divide-y divide-gray-100 text-xs">
                {paginatedClassified.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/evaluations/${p.id}`}
                      className="flex gap-3 py-3 hover:bg-gray-50 rounded-xl px-1 -mx-1 transition"
                    >
                      {p.product_image_url && (
                        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-gray-100 p-0.5">
                          <img
                            src={p.product_image_url}
                            alt={p.product_name ?? "protein"}
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4">
                        {/* 左: メーカー / 商品名 / フレーバー / レーティング */}
                        <div className="flex-1 space-y-0.5">
                          {/* 上段: テキスト（左）と価格（右）を横並びに（モバイル時） */}
                          <div className="flex items-start justify-between gap-2 sm:block">
                            <div className="space-y-0.5">
                              <p className="text-[11px] text-gray-500">
                                {p.display_manufacturer ??
                                  p.manufacturer ??
                                  "メーカー不明"}
                              </p>
                              <p className="text-[11px] font-semibold text-gray-900">
                                {p.display_product_name ?? p.product_name ?? "名称不明"}
                              </p>
                              {(p.display_flavor ?? p.flavor) && (
                                <p className="text-[11px] text-gray-500">
                                  {p.display_flavor ?? p.flavor}
                                </p>
                              )}
                            </div>

                            {/* モバイル時: 製品名/フレーバーの横に価格を表示 */}
                            {p.price_per_kg != null && (
                              <div className="mt-0.5 flex flex-col items-end sm:hidden">
                                <span className="text-[9px] text-gray-400">
                                  1kgあたり
                                </span>
                                <span className="text-base font-semibold leading-snug text-gray-900">
                                  ¥{Math.round(p.price_per_kg).toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                          {/* トップ一覧では Amazon 由来の星評価は表示しない（将来のサイト内レビューのみ用） */}
                          {/* ここでは一律で星表示をオフにする */}
                        </div>

                        {/* 中央右: 価格・販売サイトタグ・フレーバーカテゴリ（PCでは横並び） */}
                        <div className="mt-2 hidden w-full flex-col gap-1 border-t border-gray-100 pt-2 text-[10px] text-gray-600 sm:mt-0 sm:flex sm:w-64 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                            {/* 価格 */}
                            {p.price_per_kg != null ? (
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-gray-400">
                                    1kgあたり
                                  </span>
                                  {((p.display_product_name ?? p.product_name ?? "")
                                    .toLowerCase()
                                    .includes("sale") ||
                                    (p.display_product_name ?? p.product_name ?? "")
                                      .toLowerCase()
                                      .includes("タイムセール")) && (
                                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-semibold text-rose-600">
                                      SALE
                                    </span>
                                  )}
                                </div>
                                <span className="text-xl font-semibold leading-snug text-gray-900">
                                  ¥{Math.round(p.price_per_kg).toLocaleString()}
                                </span>
                              </div>
                            ) : p.is_in_stock === false ? (
                              <span className="text-[11px] font-semibold text-rose-600">
                                在庫切れ
                              </span>
                            ) : (
                              <p className="text-[11px] text-gray-400">—</p>
                            )}

                            <div className="flex flex-col items-end gap-1">
                              {/* 販売サイトタグ */}
                              {formatProductUrlLabel(p.product_url) && (
                                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-medium text-slate-600">
                                  {formatProductUrlLabel(p.product_url)}
                                </span>
                              )}
                              {/* フレーバーカテゴリ */}
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
                        </div>

                        {/* 一番右: 星マークの評価ゾーン（クリーンなバッジデザイン） */}
                        <div className="mt-2 flex items-center justify-end sm:mt-0 sm:w-32">
                          <div className="inline-flex min-w-[92px] flex-col items-end justify-center gap-1 rounded-xl bg-white/80 px-3 py-2 text-[10px] text-slate-800 ring-1 ring-slate-200 shadow-sm">
                            {p.avg_rating != null ? (
                              <>
                                <div className="flex items-center gap-1">
                                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#1F2A44] text-[11px] font-semibold text-white">
                                    {p.avg_rating.toFixed(1)}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    / 5.0
                                  </span>
                                </div>
                                <div className="flex items-center gap-0.5 text-[11px]">
                                  {Array.from({ length: 5 }).map((_, i) => {
                                    const filled = i < Math.round(p.avg_rating ?? 0)
                                    return (
                                      <span
                                        key={i}
                                        className={
                                          filled
                                            ? "text-amber-400 drop-shadow-[0_0_2px_rgba(251,191,36,0.6)]"
                                            : "text-slate-300"
                                        }
                                      >
                                        ★
                                      </span>
                                    )
                                  })}
                                </div>
                              </>
                            ) : (
                              <span className="text-[10px] text-slate-400">
                                評価データなし
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {sortedClassified.length > PAGE_SIZE && (
              <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-slate-600">
                <span>
                  {safePage} / {totalPages} ページ（全
                  {sortedClassified.length}件）
                </span>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className={`rounded-full px-3 py-1 border text-[10px] ${
                      safePage === 1
                        ? "cursor-not-allowed border-slate-200 text-slate-300 bg-white"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    前へ
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={safePage === totalPages}
                    className={`rounded-full px-3 py-1 border text-[10px] ${
                      safePage === totalPages
                        ? "cursor-not-allowed border-slate-200 text-slate-300 bg-white"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    次へ
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* サイトの特徴 */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[11px] text-slate-700 shadow-sm space-y-1">
            <p>・忖度なしで全てのプロテイン情報をリサーチ</p>
            <p>・最新の各メーカープロテインフレーバー情報を毎日アップデート</p>
            <p>・口コミレビューからあなたに合うプロテインがきっと見つかる</p>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
                人気ブランド
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                気になるブランドを選択してください。
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
                    ブランドがまだ登録されていません
                  </li>
                )}
              </ul>
            </div>

            {/* （キーワード検索バーはヘッダー内に移動） */}
            <button
              onClick={loadClassifiedProteins}
              className="mt-1 self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 hover:border-slate-300 hover:bg-slate-100"
            >
              最新の情報を再読込
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
                人気商品
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {selectedBrand
                  ? `${selectedBrand} でよく飲まれている商品です`
                  : "ブランドを選ぶと商品が表示されます"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
                      ? `${selectedBrand} の商品はまだ登録されていません`
                      : "まずブランドを選択してください"}
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
                  人気フレーバー
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                {selectedProduct
                  ? `${selectedProduct} で人気のフレーバーです`
                  : "商品を選ぶとフレーバーが表示されます"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
                        ? `${selectedProduct} のフレーバーはまだ登録されていません`
                        : "まず商品を選択してください"}
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
                  人気レビュー
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                {selectedFlavor
                  ? `${selectedFlavor} のレビューです`
                  : "フレーバーを選ぶとレビューが表示されます"}
                </p>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                {reviews.length === 0 && (
                  <p className="text-xs text-gray-400">
                    {selectedFlavor
                      ? `${selectedFlavor} のレビューはまだ登録されていません`
                      : "フレーバーを選択すると、ここにレビューが表示されます"}
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

      {/* フッター（詳細ページと同デザイン） */}
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

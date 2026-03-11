'use client'

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

export default function Page() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [flavors, setFlavors] = useState<Flavor[]>([])
  const [reviews, setReviews] = useState<Review[]>([])

  const [selectedBrand, setSelectedBrand] = useState<string>("")
  const [selectedProduct, setSelectedProduct] = useState<string>("")
  const [selectedFlavor, setSelectedFlavor] = useState<string>("")
  const [message, setMessage] = useState<string>("")

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
    <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>Protein Log</h1>
      <p>{message}</p>

      <h2>Brands</h2>
      <ul style={{ paddingLeft: "20px" }}>
        {brands.map((b) => (
          <li key={b.id} style={{ marginBottom: "12px" }}>
            <button
              onClick={() => loadProducts(b.id, b.name)}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                border: "1px solid #ccc",
                borderRadius: "8px",
                background: "#fff"
              }}
            >
              {b.name} ({b.country})
            </button>
          </li>
        ))}
      </ul>

      <h2>
        Products {selectedBrand ? `- ${selectedBrand}` : ""}
      </h2>
      <ul style={{ paddingLeft: "20px" }}>
        {products.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => loadFlavors(p.id, p.name)}
              style={{ cursor: "pointer" }}
            >
              {p.name}
            </button>
          </li>
        ))}
      </ul>

      {flavors.length > 0 && (
        <>
          <h2>
            Flavors {selectedProduct ? `- ${selectedProduct}` : ""}
          </h2>
          <ul style={{ paddingLeft: "20px" }}>
            {flavors.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => loadReviews(f.id, f.flavor_name)}
                  style={{ cursor: "pointer" }}
                >
                  {f.flavor_name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {reviews.length > 0 && (
        <>
          <h2>
            Reviews {selectedFlavor ? `- ${selectedFlavor}` : ""}
          </h2>
          <ul style={{ paddingLeft: "20px" }}>
            {reviews.map((r) => (
              <li key={r.id}>
                <strong>Rating:</strong> {r.rating} |{' '}
                <strong>Sweetness:</strong> {r.sweetness} |{' '}
                <strong>Mixability:</strong> {r.mixability}
                <div>{r.review_text}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

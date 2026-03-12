import { NextResponse } from "next/server"
import { supabase } from "../../../../lib/supabase"

type SerpApiResult = {
  organic_results?: {
    title?: string
    link?: string
    snippet?: string
  }[]
}

const SEARCH_QUERY = "プロテイン メーカー 公式サイト"

export async function POST() {
  const apiKey = process.env.SERPAPI_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "SERP API の環境変数 (SERPAPI_API_KEY) が設定されていません。SerpAPI などの検索 API キーを設定してください。"
      },
      { status: 500 }
    )
  }

  const url = new URL("https://serpapi.com/search")
  url.searchParams.set("engine", "google")
  url.searchParams.set("q", SEARCH_QUERY)
  url.searchParams.set("hl", "ja")
  url.searchParams.set("num", "10")
  url.searchParams.set("api_key", apiKey)

  try {
    const res = await fetch(url.toString())
    if (!res.ok) {
      return NextResponse.json(
        { error: `Search API failed: ${res.status}` },
        { status: 502 }
      )
    }

    const data = (await res.json()) as SerpApiResult
    const items = data.organic_results ?? []

    const rows = items
      .map((item) => {
        if (!item.link || !item.title) return null

        const name = item.title
          .replace(/公式[サイト|ホームページ]?/g, "")
          .replace(/Amazon\.co\.jp:.*/g, "")
          .trim()

        if (!name) return null

        return {
          name,
          website_url: item.link
        }
      })
      .filter((r): r is { name: string; website_url: string } => !!r)

    if (rows.length === 0) {
      return NextResponse.json(
        { message: "検索結果から有効なメーカー候補が取得できませんでした。" },
        { status: 200 }
      )
    }

    for (const row of rows) {
      const { data: existing } = await supabase
        .from("brands")
        .select("id, website_url")
        .eq("name", row.name)
        .maybeSingle()

      if (existing) {
        await supabase
          .from("brands")
          .update({ website_url: row.website_url })
          .eq("id", existing.id)
      } else {
        await supabase.from("brands").insert({
          name: row.name,
          country: null,
          website_url: row.website_url
        })
      }
    }

    return NextResponse.json(
      {
        message: "ブランド候補の URL を更新しました。",
        discovered: rows.length
      },
      { status: 200 }
    )
  } catch (e) {
    console.error(e)
    return NextResponse.json(
      { error: "検索 API 実行中に予期せぬエラーが発生しました。" },
      { status: 500 }
    )
  }
}



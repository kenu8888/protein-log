import { NextResponse } from "next/server"
import { supabase } from "../../../../lib/supabase"

const DEMO_SOURCES = [
  { manufacturer_name: "SAVAS（ザバス / 明治）", url: "https://www.meiji.co.jp/sports/savas/" },
  { manufacturer_name: "DNS", url: "https://shop.dnszone.jp/shop/default.aspx" },
  { manufacturer_name: "Kentai", url: "https://kentai.co.jp/" },
  { manufacturer_name: "X-PLOSION", url: "https://store.x-plosion.jp/" },
  { manufacturer_name: "ULTORA", url: "https://ultora.co.jp/" },
  { manufacturer_name: "GronG", url: "https://shop.grong.jp/" },
  { manufacturer_name: "ALPRON", url: "https://shop.alpron.co.jp/" },
  {
    manufacturer_name: "WINZONE",
    url: "https://www.nippon-shinyaku-shop.com/shop/pages/winzone"
  },
  { manufacturer_name: "be LEGEND（ビーレジェンド）", url: "https://store.belegend.jp/" },
  { manufacturer_name: "BULKSPORTS", url: "https://bulk-sports-jp.com/" },
  { manufacturer_name: "HALEO", url: "https://haleo.jp/" },
  { manufacturer_name: "FIXIT", url: "https://store.fix-it.jp/" },
  { manufacturer_name: "VITAS", url: "https://vitas.fitness/" },
  {
    manufacturer_name: "GOLD'S GYM（日本向け公式ストア）",
    url: "https://ggmania.jp/collections/プロテイン"
  },
  { manufacturer_name: "森永製菓 プロテイン公式", url: "https://www.morinaga.co.jp/protein/" },
  { manufacturer_name: "Dear-Natura ACTIVE（アサヒ）", url: "https://www.dear-natura.com/active-product" },
  { manufacturer_name: "Myprotein（日本向け）", url: "https://www.myprotein.jp/" },
  { manufacturer_name: "Optimum Nutrition（日本語サイト）", url: "https://www.optimumnutrition.com/ja-jp" },
  { manufacturer_name: "Naturecan Fitness JP", url: "https://www.naturecan-fitness.jp/" }
]

export async function POST() {
  const { error } = await supabase.from("manufacturer_sources").upsert(DEMO_SOURCES, {
    onConflict: "url"
  })

  if (error) {
    console.error(error)
    return NextResponse.json(
      { error: "manufacturer_sources への登録に失敗しました。" },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { message: "メーカーURLを登録しました。", count: DEMO_SOURCES.length },
    { status: 200 }
  )
}


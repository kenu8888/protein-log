/**
 * 商品ページのテキストから Gemini Flash-Lite で容量・価格・栄養を抽出する API。
 * フル同期（Python）から POST で呼び出し、CSS で取れなかった項目を補完する用。
 */
import { NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"
import { Type } from "@google/genai"

const genaiApiKey =
  process.env.GENAI_API_KEY ??
  process.env.GOOGLE_GENAI_API_KEY ??
  process.env.GOOGLE_API_KEY

const ai = genaiApiKey ? new GoogleGenAI({ apiKey: genaiApiKey }) : null

export type AiExtractProductResponse = {
  is_single_product_page: boolean
  is_protein_related: boolean | null
  manufacturer: string | null
  flavor: string | null
  unit_text: string | null
  price_jpy: number | null
  price_per_kg: number | null
  net_weight_kg: number | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  nutrition_basis_raw: string | null
  serving_size_g: number | null
  error?: string
}

const PROMPT = `あなたは日本のECサイト（主にAmazon）の商品ページからテキストを読んで、次のルールで判定・抽出してください。

【判定】
- is_single_product_page: このテキストが「1つのプロテイン商品の個別ページ」かどうか。検索結果一覧・複数商品・エラーページ・カテゴリTOPなら false。
- is_protein_related: 粉末プロテイン（ホエイ・カゼイン・ソイ等のプロテインパウダー）に関連する商品か。プロテインバー・EAA・BCAA・その他サプリは false。不明なら null。

【抽出】いずれもページ内に明記されていればその値を、なければ null。
- manufacturer: メーカー名（ブランド名）。「商品仕様」内の「メーカー」「ブランド」行を優先。無ければ商品名・説明文から推測。サイトドメインやトップのロゴも判定材料とする。企業名のみ短く。
- flavor: フレーバー・風味（例: チョコレート、バニラ、ストロベリー、抹茶など）。「風味」「フレーバー」行や商品タイトルから抽出。無ければ null。
- unit_text: 内容量の表記（例: 1kg, 908g, 2.27kg）。無ければ null。
- price_jpy: 税込価格（日本円の数値のみ）。税込、税抜表示がない場合も金額として取得する。無ければ null。
- net_weight_kg: 内容量を kg 単位の数値（例: 1, 0.908, 2.27）。
- calories: 1食あたりまたは1回分のカロリー（kcal）。「エネルギー」「熱量」の行や栄養成分表から数値のみ。
- protein_g: 1食あたりまたは1回分のタンパク質（g）。「タンパク質」「たんぱく質」の行から数値のみ。
- carbs_g: 1食あたりまたは1回分の炭水化物（g）。「炭水化物」「糖質」などから数値のみ。
- fat_g: 1食あたりまたは1回分の脂質（g）。「脂質」「脂肪」の行から数値のみ。
- nutrition_basis_raw: 栄養成分の基準。必ず「1食〇g」「1回〇g」「〇gあたり」のような文言をそのまま短く抽出（例: 「1食30gあたり」「1回分25g」）。なければ null。
- serving_size_g: 上記の基準に含まれる「1食あたりのg数」の数値のみ。nutrition_basis_raw が「1食30gあたり」なら 30、「25gあたり」なら 25。数値のみで。

【栄養の探し方】「栄養成分表示」「1食あたり」「エネルギー」「タンパク質」などの見出しがある段落・表・【商品仕様】内を優先して読む。同じブロック内の数値は同じ基準（1食〇g）で書かれていることが多い。

【出力例】栄養表示が「1食30gあたり エネルギー110kcal タンパク質24g 脂質1g 炭水化物3g」の場合:
nutrition_basis_raw: "1食30gあたり", serving_size_g: 30, calories: 110, protein_g: 24, fat_g: 1, carbs_g: 3

必ずJSONのみ返してください。`

export async function POST(req: Request) {
  if (!ai) {
    return NextResponse.json(
      { error: "GENAI_API_KEY (or GOOGLE_GENAI_API_KEY) is not set" },
      { status: 500 }
    )
  }

  let body: { page_text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const pageText = typeof body.page_text === "string" ? body.page_text : ""
  if (!pageText.trim()) {
    return NextResponse.json(
      { error: "page_text is required and must be a non-empty string" },
      { status: 400 }
    )
  }

  // 長すぎる場合は先頭のみ（トークン節約）
  const maxChars = 35000
  const textToSend =
    pageText.length > maxChars
      ? pageText.slice(0, maxChars) + "\n\n[以下省略]"
      : pageText

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: `${PROMPT}\n\n---\n\n${textToSend}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            is_single_product_page: { type: Type.BOOLEAN },
            is_protein_related: { type: Type.BOOLEAN, nullable: true },
            manufacturer: { type: Type.STRING, nullable: true },
            flavor: { type: Type.STRING, nullable: true },
            unit_text: { type: Type.STRING, nullable: true },
            price_jpy: { type: Type.NUMBER, nullable: true },
            price_per_kg: { type: Type.NUMBER, nullable: true },
            net_weight_kg: { type: Type.NUMBER, nullable: true },
            calories: { type: Type.NUMBER, nullable: true },
            protein_g: { type: Type.NUMBER, nullable: true },
            carbs_g: { type: Type.NUMBER, nullable: true },
            fat_g: { type: Type.NUMBER, nullable: true },
            nutrition_basis_raw: { type: Type.STRING, nullable: true },
            serving_size_g: { type: Type.NUMBER, nullable: true },
          },
          required: ["is_single_product_page"],
        },
      },
    })

    const raw = response.text ?? "{}"
    const parsed = JSON.parse(raw) as Record<string, unknown>

    const result: AiExtractProductResponse = {
      is_single_product_page: Boolean(parsed.is_single_product_page),
      is_protein_related:
        typeof parsed.is_protein_related === "boolean"
          ? parsed.is_protein_related
          : null,
      manufacturer:
        typeof parsed.manufacturer === "string" && parsed.manufacturer.trim()
          ? parsed.manufacturer.trim()
          : null,
      flavor:
        typeof parsed.flavor === "string" && parsed.flavor.trim()
          ? parsed.flavor.trim()
          : null,
      unit_text:
        typeof parsed.unit_text === "string" && parsed.unit_text.trim()
          ? parsed.unit_text.trim()
          : null,
      price_jpy:
        typeof parsed.price_jpy === "number" && Number.isFinite(parsed.price_jpy)
          ? parsed.price_jpy
          : null,
      price_per_kg:
        typeof parsed.price_per_kg === "number" &&
        Number.isFinite(parsed.price_per_kg)
          ? parsed.price_per_kg
          : null,
      net_weight_kg:
        typeof parsed.net_weight_kg === "number" &&
        Number.isFinite(parsed.net_weight_kg)
          ? parsed.net_weight_kg
          : null,
      calories:
        typeof parsed.calories === "number" && Number.isFinite(parsed.calories)
          ? parsed.calories
          : null,
      protein_g:
        typeof parsed.protein_g === "number" && Number.isFinite(parsed.protein_g)
          ? parsed.protein_g
          : null,
      carbs_g:
        typeof parsed.carbs_g === "number" && Number.isFinite(parsed.carbs_g)
          ? parsed.carbs_g
          : null,
      fat_g:
        typeof parsed.fat_g === "number" && Number.isFinite(parsed.fat_g)
          ? parsed.fat_g
          : null,
      nutrition_basis_raw:
        typeof parsed.nutrition_basis_raw === "string" &&
        parsed.nutrition_basis_raw.trim()
          ? parsed.nutrition_basis_raw.trim()
          : null,
      serving_size_g:
        typeof parsed.serving_size_g === "number" &&
        Number.isFinite(parsed.serving_size_g)
          ? parsed.serving_size_g
          : null,
    }

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[ai-extract-product]", message)
    return NextResponse.json(
      { error: message, is_single_product_page: false } as AiExtractProductResponse,
      { status: 200 }
    )
  }
}

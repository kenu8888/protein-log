import { GoogleGenAI } from "@google/genai";

const googleApiKey = process.env.GOOGLE_API_KEY;
// 明示的に API キーを渡して、ADC 経由のスコープ不足を避ける
export const ai = new GoogleGenAI(
  googleApiKey ? { apiKey: googleApiKey } : {}
);

export async function askGeminiText(prompt: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: prompt,
  });

  return response.text ?? "";
}

import { Type } from "@google/genai";
import { ProteinResultSchema, type ProteinResult } from "./proteinSchema";

export async function classifyProteinText(inputText: string): Promise<ProteinResult> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: `
以下のテキストを読んで、商品が粉末プロテインかどうかを判定してください。

ルール:
- 粉末プロテインなら is_protein_powder を true
- プロテインバー、EAA、BCAA、その他サプリなら false
- 不明な項目は null
- price_jpy は日本円の数値。分からなければ null
- protein_grams_per_serving は 1食あたりのタンパク質量 (g)。分からなければ null
- calories / carbs / fat はそれぞれ 1食あたり、または1回分の栄養情報から読み取れる場合のみ数値 (kcal, g) を入れてください。分からなければ null
- avg_rating は 1.0〜5.0 程度のイメージで、商品説明やレビューから読み取れる場合のみ数値。分からなければ null
 - price_per_kg は 1kg あたりのおおよその価格（円）。単位や容量と価格から推定できるときのみ数値。分からなければ null
 - flavor_category は味の傾向を次から1つ選ぶ: 
   "choco"（チョコ系）| "coffee"（コーヒー系）| "fruit"（フルーツ系）| 
   "milk"（ミルク系）| "sweets"（お菓子系）| "meal"（食事系/スープ系）|
   "plain"（プレーン/味なし）| "yogurt"（ヨーグルト系）| "matcha"（抹茶系）| "other"
- display_manufacturer / display_product_name / display_flavor は、画面に表示する用の短めのテキストです。メーカー名・商品名・フレーバー名を、日本語として自然で読みやすい長さ（おおよそ 10〜25 文字程度）に整形してください。不要な型番や容量表記（1kg, 1000g など）は省いて構いません。
- confidence は 0 から 1 の数値
- 必ずJSONのみ返してください

対象テキスト:
${inputText}
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          is_protein_powder: { type: Type.BOOLEAN },
          excluded_reason: {
            type: Type.STRING,
            nullable: true,
            enum: [
              "protein_bar",
              "eaa",
              "bcaa",
              "other_supplement",
              "not_protein_related",
              "unknown",
            ],
          },
          manufacturer: { type: Type.STRING, nullable: true },
          product_name: { type: Type.STRING, nullable: true },
          flavor: { type: Type.STRING, nullable: true },
          price_jpy: { type: Type.NUMBER, nullable: true },
          protein_grams_per_serving: { type: Type.NUMBER, nullable: true },
          calories: { type: Type.NUMBER, nullable: true },
          carbs: { type: Type.NUMBER, nullable: true },
          fat: { type: Type.NUMBER, nullable: true },
          avg_rating: { type: Type.NUMBER, nullable: true },
          price_per_kg: { type: Type.NUMBER, nullable: true },
          flavor_category: {
            type: Type.STRING,
            nullable: true,
            enum: [
              "choco",
              "coffee",
              "fruit",
              "milk",
              "sweets",
              "meal",
              "plain",
              "yogurt",
              "matcha",
              "other",
            ],
          },
          display_manufacturer: { type: Type.STRING, nullable: true },
          display_product_name: { type: Type.STRING, nullable: true },
          display_flavor: { type: Type.STRING, nullable: true },
          protein_type: {
            type: Type.STRING,
            nullable: true,
            enum: ["whey", "casein", "soy", "pea", "egg", "mixed", "unknown"],
          },
          confidence: { type: Type.NUMBER, nullable: true },
        },
        required: ["is_protein_powder"],
      },
    },
  });

  const parsed = JSON.parse(response.text ?? "{}");
  return ProteinResultSchema.parse(parsed);
}
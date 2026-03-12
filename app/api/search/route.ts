import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { ai } from "../../../src/lib/gemini";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = (body.query as string | undefined)?.trim() ?? "";
    const limit = (body.limit as number | undefined) ?? 20;

    if (!query) {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 }
      );
    }

    const embeddingRes = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: query,
    });

    const embedding = embeddingRes.embeddings?.[0];
    if (!embedding) {
      return NextResponse.json(
        { error: "Failed to generate embedding" },
        { status: 500 }
      );
    }

    // pgvector 側のカラム定義（vector(768)）に合わせて先頭 768 次元だけを利用する
    const queryEmbedding = embedding.values.slice(0, 768);

    // Call Postgres function to get nearest products
    const { data: matches, error: matchError } = await supabase.rpc(
      "match_products",
      {
        query_embedding: queryEmbedding,
        match_count: limit,
      }
    );

    if (matchError) {
      console.error("match_products error", matchError);
      return NextResponse.json(
        { error: "Failed to search products" },
        { status: 500 }
      );
    }

    if (!matches || matches.length === 0) {
      return NextResponse.json({ products: [], message: "該当するプロテインが見つかりませんでした。" });
    }

    const ids = (matches as { id: string }[]).map((m) => m.id);

    const { data: rows, error: rowsError } = await supabase
      .from("product_classification_results")
      .select(
        "id, manufacturer, product_name, flavor, price_jpy, protein_grams_per_serving, avg_rating, price_per_kg, flavor_category, display_manufacturer, display_product_name, display_flavor, product_url, product_image_url, confidence, is_protein_powder"
      )
      .in("id", ids);

    if (rowsError) {
      console.error("fetch products error", rowsError);
      return NextResponse.json(
        { error: "Failed to load products" },
        { status: 500 }
      );
    }

    // 保持している順序（類似度順）で並び替え
    const orderMap = new Map<string, number>();
    ids.forEach((id, index) => orderMap.set(id, index));

    const ordered =
      rows?.slice().sort((a: any, b: any) => {
        const ai = orderMap.get(a.id) ?? 0;
        const bi = orderMap.get(b.id) ?? 0;
        return ai - bi;
      }) ?? [];

    return NextResponse.json({
      products: ordered,
      message: undefined,
    });
  } catch (err) {
    console.error("search API error", err);
    return NextResponse.json(
      { error: "Unexpected error in search API" },
      { status: 500 }
    );
  }
}


import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { ai } from "../lib/gemini";

type ClassifiedRow = {
  id: string;
  manufacturer: string | null;
  product_name: string | null;
  flavor: string | null;
  display_manufacturer: string | null;
  display_product_name: string | null;
  display_flavor: string | null;
};

function getSupabase() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)"
    );
  }

  return createClient(supabaseUrl, supabaseKey);
}

function buildSearchText(row: ClassifiedRow): string {
  const manufacturer = row.display_manufacturer ?? row.manufacturer ?? "";
  const product = row.display_product_name ?? row.product_name ?? "";
  const flavor = row.display_flavor ?? row.flavor ?? "";

  return [manufacturer, product, flavor]
    .map((v) => v.trim())
    .filter(Boolean)
    .join(" ");
}

async function backfillEmbeddings(batchSize = 100) {
  const supabase = getSupabase();

  // まだ search_embedding が入っていない、粉末プロテインだけを対象にする
  const { data, error } = await supabase
    .from("product_classification_results")
    .select(
      "id, manufacturer, product_name, flavor, display_manufacturer, display_product_name, display_flavor"
    )
    .eq("is_protein_powder", true)
    .is("search_embedding", null)
    .limit(batchSize);

  if (error) {
    throw new Error(`backfillEmbeddings: fetch error: ${error.message}`);
  }

  const rows = (data ?? []) as ClassifiedRow[];

  if (rows.length === 0) {
    console.log("No rows without embeddings. Nothing to do.");
    return;
  }

  const texts = rows.map(buildSearchText);

  console.log(`Generating embeddings for ${rows.length} products (Gemini)...`);

  const embeddingResponse = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: texts,
  });

  if (!embeddingResponse.embeddings || embeddingResponse.embeddings.length !== rows.length) {
    throw new Error(
      `Embedding count mismatch: expected ${rows.length}, got ${embeddingResponse.embeddings?.length ?? 0}`
    );
  }

  // 既存行に対して search_embedding だけを UPDATE する（INSERT は行わない）
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const embedding = embeddingResponse.embeddings![i].values;

    const { error: updateError } = await supabase
      .from("product_classification_results")
      .update({ search_embedding: embedding })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(
        `backfillEmbeddings: failed to update embedding for id=${row.id}: ${updateError.message}`
      );
    }
  }

  console.log(`Backfilled embeddings for ${rows.length} products.`);
}

if (require.main === module) {
  backfillEmbeddings()
    .then(() => {
      console.log("Embedding backfill completed.");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}


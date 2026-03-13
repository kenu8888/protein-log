import { createClient } from "@supabase/supabase-js";
import { load } from "cheerio";

// Load env for local runs
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config({ path: ".env.local" });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
} catch {
  /* ignore */
}

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

const supabase = createClient(supabaseUrl, supabaseKey);

const MIN_DELAY_MS = 1500;
const MAX_DELAY_MS = 4000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function randomDelay() {
  return (
    MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS))
  );
}

function extractNutritionText(html: string): string | null {
  const $ = load(html);

  // 1. Myprotein JP サイトでよくある栄養成分ブロック
  const container = $(".nutritional-info-container").first();
  if (container.length > 0) {
    const text = container.text().replace(/\s+/g, " ").trim();
    if (text) return text;
  }

  // 2. 「栄養成分」などの見出しを起点に table / 親ブロックを拾う
  const heading = $("h1,h2,h3,p,strong,td,th")
    .filter((_, el) => $(el).text().includes("栄養成分"))
    .first();
  if (heading.length > 0) {
    const table = heading.closest("table");
    if (table.length > 0) {
      const text = table.text().replace(/\s+/g, " ").trim();
      if (text) return text;
    }
    const parent = heading.closest("li,div,section");
    if (parent.length > 0) {
      const text = parent.text().replace(/\s+/g, " ").trim();
      if (text) return text;
    }
  }

  // 3. 英語サイトの "NUTRITIONAL INFORMATION" テーブルにフォールバック
  const englishHeading = $("td,th,span")
    .filter((_, el) =>
      $(el).text().toUpperCase().includes("NUTRITIONAL INFORMATION")
    )
    .first();
  if (englishHeading.length > 0) {
    const table = englishHeading.closest("table");
    if (table.length > 0) {
      const text = table.text().replace(/\s+/g, " ").trim();
      if (text) return text;
    }
  }

  return null;
}

async function enrichMyproteinNutrition(limit: number) {
  const { data, error } = await supabase
    .from("manufacturer_products")
    .select(
      "id, manufacturer_name, manufacturer_code, source_url, raw_product_name"
    )
    .or(
      "manufacturer_code.eq.myprotein,manufacturer_name.ilike.%Myprotein%,manufacturer_name.ilike.%マイプロテイン%"
    )
    .not("source_url", "is", null)
    // すでに栄養成分が付いているものはスキップ
    .or(
      "raw_product_name.is.null,raw_product_name.not.ilike.%[栄養成分]%"
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`manufacturer_products fetch failed: ${error.message}`);
  }

  const rows =
    (data as {
      id: string;
      manufacturer_name: string | null;
      manufacturer_code: string | null;
      source_url: string | null;
      raw_product_name: string | null;
    }[]) ?? [];

  if (rows.length === 0) {
    console.log("No Myprotein rows to enrich (query returned 0 rows).");
    return;
  }

  console.log(
    `Fetched ${rows.length} Myprotein candidate rows for nutrition enrichment.`
  );

  const updates: {
    id: string;
    manufacturer_name: string;
    manufacturer_code: string | null;
    raw_product_name: string;
  }[] = [];

  for (const row of rows) {
    if (!row.source_url) continue;

    try {
      const res = await fetch(row.source_url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Accept-Language": "ja,en;q=0.8",
        },
      });

      if (!res.ok) {
        console.warn(
          `Failed to fetch detail page for Myprotein (${row.source_url}): ${res.status}`
        );
        continue;
      }

      const html = await res.text();
      const nutrition = extractNutritionText(html);
      if (!nutrition) {
        continue;
      }

      const baseText = row.raw_product_name
        ? String(row.raw_product_name)
        : "";
      const nutritionBlock =
        "\n\n[栄養成分]\n" + nutrition.slice(0, 1500);

      updates.push({
        id: row.id,
        manufacturer_name: row.manufacturer_name ?? "Myprotein",
        manufacturer_code: row.manufacturer_code ?? "myprotein",
        raw_product_name: baseText + nutritionBlock,
      });

      await sleep(randomDelay());
    } catch (e) {
      console.error(
        `Error while fetching Myprotein nutrition for ${row.source_url}`,
        e
      );
      continue;
    }
  }

  if (updates.length === 0) {
    console.log("No nutrition texts extracted for Myprotein.");
    return;
  }

  // id ごとに 1 レコードにまとめる
  const uniqueUpdates = Array.from(
    new Map(updates.map((u) => [u.id, u])).values()
  );

  const { error: upsertError } = await supabase
    .from("manufacturer_products")
    .upsert(uniqueUpdates, { onConflict: "id" });

  if (upsertError) {
    throw new Error(
      `Myprotein nutrition upsert failed: ${upsertError.message}`
    );
  }

  console.log(
    JSON.stringify(
      {
        message: "Myprotein nutrition enrichment completed",
        enriched: uniqueUpdates.length,
      },
      null,
      2
    )
  );
}

async function main() {
  const limit = Number(process.env.MYPROTEIN_NUTRITION_LIMIT ?? "200");
  await enrichMyproteinNutrition(limit);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


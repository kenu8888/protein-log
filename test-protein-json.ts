import { classifyProteinText } from "./src/lib/gemini";

async function main() {
  const result = await classifyProteinText(`
    マイプロテイン Impact Whey Protein
    チョコレートスムーズ味
    1kg 3980円
    ホエイプロテイン
  `);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});